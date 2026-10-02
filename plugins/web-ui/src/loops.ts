import { LOOP_ICONS, loopIcon, readLoopIcon } from "./loop-icon";
import { html, nothing, render, type TemplateResult } from "lit";
import { CheckCircle2, CornerUpLeft, Pause, Play, Zap } from "lucide";
import { api } from "./core-bridge";
import { errMessage } from "../../chassis/src/errors";
import { fieldSelect, icon } from "./ui";
import { listBackLink, listPageTpl } from "./list-page";
import { appState, can } from "./shell";
import { t } from "../../chassis/src/i18n-lit.ts";
import { formatRelativeTime } from "../../chassis/src/i18n.ts";

interface LoopView {
  id: string;
  name: string;
  icon?: string;
  purpose?: string;
  playbook: string;
  playbookVersion: number;
  successCondition: string;
  shipActions: Array<{ action: string; gate: "auto" | "hold" }>;
  state: "enabled" | "paused" | "quarantined" | "archived";
  health: "healthy" | "degraded" | "failing" | "quarantined";
  healthReason?: string;
  owner: string;
  cronId?: string;
  sources?: string[];
  lastFiredAt?: number;
  consecutiveFailedFires?: number;
}

interface LoopItemView {
  id: string;
  sourceKey: string;
  sourceSummary?: string;
  status: string;
  attempts: number;
  parkedReason?: string;
  guidance?: string;
  updatedAt: number;
}

interface LoopOutputView {
  id: string;
  itemId: string;
  shipAction: string;
  label?: string;
  externalRef?: string;
  title: string;
  summary?: string;
  state: "ready" | "unconfirmed" | "shipped" | "returned" | "expired";
  decidedBy?: string;
  decisionNote?: string;
  createdAt: number;
}

interface LoopDetail {
  loop: LoopView;
  items: LoopItemView[];
  outputs: LoopOutputView[];
  vitals: { queue: { queued: number; inProgress: number }; openOutputs: number };
}

interface IngestionSource {
  id: string;
  kind: "webhook" | "slack" | "gmail";
  enabled: boolean;
  url: string;
  channels?: string[];
  gmail?: { email: string; expiresAt: number };
  lastReceivedAt?: number;
  lastError?: string;
}
let ingestion: { sources: IngestionSource[]; gmailAvailable: boolean } | null = null;
let ingestionKind: IngestionSource["kind"] | "" = "";
let ingestionSecret = "";
let ingestionTeam = "";
let ingestionChannels = "";
let createdSecret = "";

let loopList: LoopView[] = [];
let loopsHost: HTMLElement | null = null;
let loopsLoading = false;
let loopsNotice = "";
let activeLoopId: string | null = null;
let activeDetail: LoopDetail | null = null;
let loopBusy = false;
let iconPickerOpen = false;
let playbookDraft: string | null = null;
let returnDrafts = new Map<string, string>();

export function resetActiveLoop(): void {
  activeLoopId = null;
  iconPickerOpen = false;
  ingestion = null;
  ingestionKind = "";
  createdSecret = "";
  ingestionSecret = "";
  activeDetail = null;
  playbookDraft = null;
  returnDrafts = new Map();
}

function healthBadge(loop: LoopView): TemplateResult {
  const label = loop.state === "enabled" ? loop.health : loop.state;
  return html`<span class="loop-health loop-health-${label}" title=${loop.healthReason ?? ""}>${label}</span>`;
}

function ago(ts?: number): string {
  if (!ts) return t("never");
  return formatRelativeTime(ts);
}

async function refreshLoops(): Promise<void> {
  loopsLoading = true;
  paint();
  try {
    const r = await api<{ loops: LoopView[] }>("/api/loops");
    loopList = r.loops ?? [];
    loopsNotice = "";
  } catch (e) {
    loopsNotice = errMessage(e);
  } finally {
    loopsLoading = false;
    paint();
  }
}

async function refreshDetail(id: string): Promise<void> {
  try {
    const [detail, sources] = await Promise.all([
      api<LoopDetail>(`/api/loops/${encodeURIComponent(id)}`),
      api<NonNullable<typeof ingestion>>(`/api/loops/${encodeURIComponent(id)}/ingestion`),
    ]);
    activeDetail = detail;
    ingestion = sources;
    loopsNotice = "";
  } catch (e) {
    loopsNotice = errMessage(e);
  }
  paint();
}

async function mutate(fn: () => Promise<unknown>): Promise<void> {
  if (loopBusy) return;
  loopBusy = true;
  paint();
  let failure = "";
  try {
    await fn();
    loopsNotice = "";
  } catch (e) {
    failure = errMessage(e);
  } finally {
    loopBusy = false;
    if (activeLoopId) await refreshDetail(activeLoopId);
    else await refreshLoops();
    if (failure) {
      loopsNotice = failure;
      paint();
    }
  }
}

async function setLoopIcon(loop: LoopView, value: string | null | File): Promise<void> {
  await mutate(async () => {
    const icon = value instanceof File ? await readLoopIcon(value) : value;
    await api(`/api/loops/${encodeURIComponent(loop.id)}`, { method: "PATCH", body: JSON.stringify({ icon }) });
    iconPickerOpen = false;
    const { refreshInbox } = await import("./inbox");
    await refreshInbox({ silent: true });
  });
  loopsHost?.querySelector<HTMLElement>(".loop-icon-picker summary")?.focus();
}

export function openLoop(id: string): void {
  resetActiveLoop();
  activeLoopId = id;
  activeDetail = null;
  playbookDraft = null;
  void refreshDetail(id);
  paint();
}

function setState(loop: LoopView, state: LoopView["state"]): void {
  void mutate(() =>
    api(`/api/loops/${encodeURIComponent(loop.id)}`, { method: "PATCH", body: JSON.stringify({ state }) }),
  );
}

function fireNow(loop: LoopView): void {
  void mutate(() => api(`/api/loops/${encodeURIComponent(loop.id)}/fire`, { method: "POST" }));
}

function setAutopilot(loop: LoopView, enabled: boolean): void {
  void mutate(() =>
    api(`/api/loops/${encodeURIComponent(loop.id)}/autopilot`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  );
}

function decide(loop: LoopView, output: LoopOutputView, decision: "ship" | "return"): void {
  const note = returnDrafts.get(output.id)?.trim();
  if (decision === "return" && !note) {
    loopsNotice = "a return needs a note for the next attempt";
    paint();
    return;
  }
  void mutate(() =>
    api(`/api/loops/${encodeURIComponent(loop.id)}/outputs/${encodeURIComponent(output.id)}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
    }),
  );
  returnDrafts.delete(output.id);
}

function savePlaybook(loop: LoopView): void {
  const draft = playbookDraft?.trim();
  if (!draft || draft === loop.playbook) {
    playbookDraft = null;
    paint();
    return;
  }
  void mutate(() =>
    api(`/api/loops/${encodeURIComponent(loop.id)}`, { method: "PATCH", body: JSON.stringify({ playbook: draft }) }),
  );
  playbookDraft = null;
}

function reviewRow(loop: LoopView, output: LoopOutputView, shipLabel = t("Ship")): TemplateResult {
  const externalUrl = output.externalRef && /^https?:\/\//i.test(output.externalRef) ? output.externalRef : undefined;
  return html`
    <div class="loop-output">
      <div class="loop-output-main">
        <span class="loop-output-action">${output.shipAction}${output.label ? html` · ${output.label}` : nothing}</span>
        <span class="loop-output-title">
          ${
            externalUrl
              ? html`<a href=${externalUrl} target="_blank" rel="noopener noreferrer">${output.title}</a>`
              : output.title
          }
        </span>
        ${output.summary ? html`<span class="loop-output-summary">${output.summary}</span>` : nothing}
      </div>
      <div class="loop-output-decide">
        <input
          type="text"
          placeholder=${t("return note…")}
          .value=${returnDrafts.get(output.id) ?? ""}
          @input=${(e: Event) => returnDrafts.set(output.id, (e.target as HTMLInputElement).value)}
        />
        <button class="btn" type="button" ?disabled=${loopBusy} @click=${() => decide(loop, output, "return")}>
          ${icon(CornerUpLeft, 14)}<span>${t("Return")}</span>
        </button>
        <button class="btn primary" type="button" ?disabled=${loopBusy} @click=${() => decide(loop, output, "ship")}>
          ${icon(CheckCircle2, 14)}<span>${t(shipLabel)}</span>
        </button>
      </div>
    </div>
  `;
}

function itemRow(item: LoopItemView): TemplateResult {
  return html`
    <div class="loop-item">
      <span class="loop-item-status loop-item-${item.status}">${item.status}</span>
      <span class="loop-item-key">${item.sourceKey}</span>
      <span class="loop-item-summary">${item.sourceSummary ?? ""}</span>
      <span class="loop-item-meta">
        ${item.attempts > 0 ? t("{count} attempts", { count: item.attempts }) : ""}
        ${item.parkedReason ? html` · <span title=${item.parkedReason}>${t("parked")}</span>` : nothing}
      </span>
    </div>
  `;
}

async function addIngestion(loop: LoopView): Promise<void> {
  await mutate(async () => {
    const result = await api<{ secret?: string }>(`/api/loops/${encodeURIComponent(loop.id)}/ingestion`, {
      method: "POST",
      body: JSON.stringify({
        kind: ingestionKind,
        ...(ingestionKind === "slack"
          ? {
              secret: ingestionSecret,
              teamId: ingestionTeam.trim(),
              channels: ingestionChannels.split(/[\s,]+/).filter(Boolean),
            }
          : {}),
      }),
    });
    createdSecret = result.secret ?? "";
    ingestionSecret = "";
    ingestionKind = "";
    await refreshDetail(loop.id);
  });
}

function ingestionTpl(loop: LoopView): TemplateResult {
  const names = { webhook: "Signed webhook", slack: "Slack events", gmail: "Gmail Pub/Sub" };
  return html`<section class="loop-ingestion">
    <div class="loop-ingestion-heading">
      <h2>${t("Ingestion")}</h2>
      <span>${loop.cronId ? t("Scheduled sync enabled") : t("No scheduled sync")}</span>
    </div>
    <p>${t("Choose how new work reaches this Loop. Event sources can run alongside a schedule.")}</p>
    ${ingestion?.sources.map(
      (source) =>
        html`<div class="loop-ingestion-source">
          <div class="loop-ingestion-source-head">
            <strong>${t(names[source.kind])}</strong
            ><span>${source.enabled ? t("Listening") : t("Disabled")}</span
            ><button
              class="btn compact"
              ?disabled=${loopBusy}
              @click=${() =>
                mutate(async () => {
                  await api(`/api/loops/${encodeURIComponent(loop.id)}/ingestion/${encodeURIComponent(source.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify({ enabled: !source.enabled }),
                  });
                  await refreshDetail(loop.id);
                })}
            >
              ${source.enabled ? t("Disable") : t("Enable")}
            </button>
          </div>
          <label
            >${t("Endpoint")}<input
              readonly
              .value=${source.url}
              aria-label=${t("{source} endpoint", { source: names[source.kind] })}
          /></label
          >
          ${source.gmail ? html`<p>${source.gmail.email} · ${t("watch renews automatically")}</p>` : nothing}
          ${source.channels?.length
            ? html`<p>${t("Channels: {list}", { list: source.channels.join(", ") })}</p>`
            : nothing}
          <p>
            ${t("Last event: {when}", { when: ago(source.lastReceivedAt) })}${loop.state !== "enabled"
              ? ` · ${t("Processing paused")}`
              : ""}
          </p>
          ${source.lastError ? html`<p class="error-banner">${source.lastError}</p>` : nothing}
        </div>`,
    )}
    ${
      createdSecret
        ? html`<div class="loop-ingestion-secret">
            <label
              >${t("Signing secret — save it now; it is only shown once")}<input
                readonly
                .value=${createdSecret}
                aria-label=${t("Webhook signing secret")}
            /></label>
            <p>${t("Sign the exact JSON body with HMAC-SHA256 and send its hex digest in X-Signature.")}</p>
            <button
              class="btn compact"
              @click=${() => {
                createdSecret = "";
                paint();
              }}
            >
              ${t("Done")}
            </button>
          </div>`
        : nothing
    }
    <div class="loop-ingestion-add">
      ${fieldSelect({
        ariaLabel: t("Ingestion source"),
        value: ingestionKind,
        onChange: (value) => {
          ingestionKind = value as typeof ingestionKind;
          ingestionSecret = "";
          paint();
        },
        options: html`<option value="">${t("Add event source…")}</option>
          ${Object.entries(names)
            .filter(
              ([kind]) =>
                !ingestion?.sources.some((source) => source.kind === kind) &&
                (!loop.sources?.length ? true : kind !== "webhook" && loop.sources.includes(kind)),
            )
            .map(([kind, name]) => html`<option value=${kind}>${t(name)}</option>`)}`,
      })}
    </div>
    ${
      ingestionKind === "slack"
        ? html`<div class="loop-ingestion-fields">
            <label
              >${t("Workspace ID")}<input
                placeholder="T0123456789"
                .value=${ingestionTeam}
                @input=${(event: Event) => {
                  ingestionTeam = (event.target as HTMLInputElement).value;
                }} /></label
            ><label
              >${t("Channel IDs")}<input
                placeholder="C0123456789, C9876543210"
                .value=${ingestionChannels}
                @input=${(event: Event) => {
                  ingestionChannels = (event.target as HTMLInputElement).value;
                }} /></label
            ><label
              >${t("Slack signing secret")}<input
                type="password"
                autocomplete="off"
                .value=${ingestionSecret}
                @input=${(event: Event) => {
                  ingestionSecret = (event.target as HTMLInputElement).value;
                }}
            /></label>
            <p>
              ${t(
                "Use the endpoint as your Slack app’s Events API request URL. Only human messages from these channels are accepted.",
              )}
            </p>
          </div>`
        : nothing
    }
    ${
      ingestionKind === "gmail"
        ? html`<p
            >${ingestion?.gmailAvailable
              ? t("Uses your connected personal Gmail account. New Inbox messages become Loop work items.")
              : t(
                  "An administrator must configure the Google Cloud Pub/Sub topic, audience, and push service account before Gmail can be enabled.",
                )}</p
          >`
        : nothing
    }
    ${
      ingestionKind
        ? html`<button
            class="btn compact"
            ?disabled=${loopBusy || (ingestionKind === "gmail" && !ingestion?.gmailAvailable)}
            @click=${() => void addIngestion(loop)}
            >${loopBusy ? t("Connecting…") : t("Enable {source}", { source: names[ingestionKind] })}</button
          >`
        : nothing
    }
  </section>`;
}

function detailTpl(detail: LoopDetail): TemplateResult {
  const { loop, items, outputs } = detail;
  const autopilot = loop.shipActions.length > 0 && loop.shipActions.every((policy) => policy.gate === "auto");
  const ready = outputs.filter((o) => o.state === "ready");
  const unconfirmed = outputs.filter((o) => o.state === "unconfirmed");
  const decided = outputs.filter((o) => o.state !== "ready" && o.state !== "unconfirmed");
  return html`
    ${listBackLink(t("Loops"), () => {
      resetActiveLoop();
      paint();
      void refreshLoops();
    })}
    <div class="list-page-head">
      <div class="loop-title">
        <details
          class="loop-icon-picker"
          .open=${iconPickerOpen}
          @toggle=${(event: Event) => {
            iconPickerOpen = (event.currentTarget as HTMLDetailsElement).open;
          }}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Escape") {
              iconPickerOpen = false;
              (event.currentTarget as HTMLDetailsElement).open = false;
              (event.currentTarget as HTMLElement).querySelector("summary")?.focus();
            }
          }}
        >
          <summary aria-label=${t("Change icon for {name}", { name: loop.name })} title=${t("Change icon")}
            >${loopIcon(loop, 24)}</summary
          >
          <div class="loop-icon-popover" role="group" aria-label=${t("Loop icon")}>
            <span class="loop-icon-heading">${t("Choose an icon")}</span>
            <div class="loop-icon-grid">
              ${LOOP_ICONS.map((choice) => html`<button type="button" aria-label=${t(choice.label)} title=${t(choice.label)} aria-pressed=${loop.icon === choice.id ? "true" : "false"} ?disabled=${loopBusy} @click=${() => void setLoopIcon(loop, choice.id)}>${loopIcon({ icon: choice.id }, 20)}</button>`)}
            </div>
            <label class="loop-icon-upload">
              <span>${loopBusy ? t("Saving…") : t("Upload image")}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                aria-label=${t("Upload loop icon")}
                ?disabled=${loopBusy}
                @change=${(event: Event) => {
                  const input = event.currentTarget as HTMLInputElement;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file) void setLoopIcon(loop, file);
                }}
              />
            </label>
            <span class="loop-icon-hint">${t("Images up to 2 MB, including SVG")}</span>
            <button
              class="loop-icon-default"
              type="button"
              ?disabled=${loopBusy || !loop.icon}
              @click=${() => void setLoopIcon(loop, null)}
            >
              ${loopIcon({ sources: loop.sources })}<span>${t("Use default")}</span>
            </button>
          </div>
        </details>
        <h1 class="pane-title">${loop.name}</h1>
      </div>
      <div class="list-page-actions">
        ${healthBadge(loop)}
        <button class="btn" type="button" ?disabled=${loopBusy} @click=${() => fireNow(loop)}>
          ${icon(Zap, 14)}<span>${t("Fire now")}</span>
        </button>
        ${
          loop.state === "enabled"
            ? html`<button class="btn" type="button" ?disabled=${loopBusy} @click=${() => setState(loop, "paused")}>
                ${icon(Pause, 14)}<span>${t("Pause")}</span>
              </button>`
            : html`<button
                class="btn primary"
                type="button"
                ?disabled=${loopBusy}
                @click=${() => setState(loop, "enabled")}
              >
                ${icon(Play, 14)}<span>${loop.state === "quarantined" ? t("Clear quarantine") : t("Resume")}</span>
              </button>`
        }
      </div>
    </div>
    ${loop.healthReason ? html`<p class="loop-health-reason">${loop.healthReason}</p>` : nothing}
    ${loopsNotice ? html`<p class="error-banner">${loopsNotice}</p>` : nothing}
    ${
      loop.shipActions.length
        ? html`<button
            class="loop-autopilot ${autopilot ? "on" : ""}"
            type="button"
            role="switch"
            aria-checked=${autopilot ? "true" : "false"}
            ?disabled=${loopBusy}
            @click=${() => setAutopilot(loop, !autopilot)}
          >
            <span class="loop-autopilot-copy">
              <span class="loop-autopilot-label">${t("Autopilot")}</span>
              <span class="loop-autopilot-sublabel"
                >${autopilot ? t("Shipping without review") : t("Ships outputs without review")}</span
              >
            </span>
            <span class="loop-autopilot-switch"><span></span></span>
          </button>`
        : nothing
    }

    <h2 class="loop-section-title">
      ${t("Ready to ship")} ${ready.length ? html`<span class="loop-count">${ready.length}</span>` : nothing}
    </h2>
    ${ready.length ? ready.map((o) => reviewRow(loop, o)) : html`<p class="list-empty">${t("Nothing waiting on you.")}</p>`}

    <h2 class="loop-section-title">
      ${t("Needs confirmation")} ${unconfirmed.length ? html`<span class="loop-count">${unconfirmed.length}</span>` : nothing}
    </h2>
    ${
      unconfirmed.length
        ? unconfirmed.map((o) => reviewRow(loop, o, t("Confirm shipped")))
        : html`<p class="list-empty">${t("Nothing needs confirmation.")}</p>`
    }
    ${ingestionTpl(loop)}
    <h2 class="loop-section-title">${t("Playbook")} <span class="loop-count">v${loop.playbookVersion}</span></h2>
    <textarea
      class="loop-playbook"
      rows="10"
      .value=${playbookDraft ?? loop.playbook}
      @input=${(e: Event) => {
        playbookDraft = (e.target as HTMLTextAreaElement).value;
      }}
    ></textarea>
    <div class="loop-playbook-actions">
      <span class="loop-success-condition" title=${t("success condition")}
        >${t("Done when: {condition}", { condition: loop.successCondition })}</span
      >
      ${
        playbookDraft !== null && playbookDraft !== loop.playbook
          ? html`<button class="btn primary" type="button" ?disabled=${loopBusy} @click=${() => savePlaybook(loop)}>
              ${t("Save playbook")}
            </button>`
          : nothing
      }
    </div>

    <h2 class="loop-section-title">${t("Work ledger")}</h2>
    ${items.length ? items.map(itemRow) : html`<p class="list-empty">${t("No items yet. Fire the loop.")}</p>`}
    ${
      decided.length
        ? html`<h2 class="loop-section-title">${t("Decided")}</h2>
            ${decided.map(
              (o) => html`
                <div class="loop-output loop-output-decided">
                  <span class="loop-output-state loop-output-${o.state}">${o.state}</span>
                  <span class="loop-output-title">${o.title}</span>
                  <span class="loop-output-meta"
                    >${o.decidedBy ?? ""} ${o.decisionNote ? `· ${o.decisionNote}` : ""}</span
                  >
                </div>
              `,
            )}`
        : nothing
    }
  `;
}

function loopRow(loop: LoopView): TemplateResult {
  return html`
    <button class="list-row loop-row" type="button" @click=${() => openLoop(loop.id)}>
      ${loopIcon(loop, 18)}<span class="loop-row-name">${loop.name}</span>
      ${healthBadge(loop)}
      <span class="loop-row-meta">${t("last fire {when}", { when: ago(loop.lastFiredAt) })}</span>
    </button>
  `;
}

function paint(): void {
  if (!loopsHost || appState.currentView !== "loops") return;
  if (activeLoopId) {
    render(activeDetail ? detailTpl(activeDetail) : html`<p class="list-empty">${t("Loading…")}</p>`, loopsHost);
    return;
  }
  render(
    listPageTpl({
      title: t("Loops"),
      rows: loopList.map(loopRow),
      empty: loopsLoading
        ? t("Loading…")
        : (loopsNotice ??
          t("No loops yet. Ask the agent to set one up. The define-loop skill walks through it, shadow run first.")),
    }),
    loopsHost,
  );
}

export async function renderLoopsPage(): Promise<void> {
  if (!can("loops")) return;
  if (!appState.mainEl) return;
  if (!loopsHost || loopsHost.parentElement !== appState.mainEl) {
    loopsHost = document.createElement("div");
    loopsHost.className = "pane loops-page";
    appState.mainEl.replaceChildren(loopsHost);
  }
  paint();
  await refreshLoops();
  if (activeLoopId) await refreshDetail(activeLoopId);
}
