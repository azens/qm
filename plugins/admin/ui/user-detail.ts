import { html, nothing } from "lit";
import { card, table, badge, renderer } from "./shared.ts";
import { t } from "../../chassis/src/i18n-lit.ts";
import { formatNumber } from "../../chassis/src/i18n.ts";

const GRANT_STATUS: Record<string, string> = {
  active: "Active",
  used: "Used",
  expired: "Expired",
  revoked: "Revoked",
  unknown: "unknown",
};

export async function detail(root: HTMLElement, principal: string, s: Record<string, any>) {
  const paint = renderer(root);
  const back = { label: "← " + t("Users"), onClick: () => window.history.back() };
  s.pageShell({ back, title: principal || t("User") });
  paint(() => html`<div class="detail">${t("Loading…")}</div>`);
  const r = await s.api("GET", "/api/users/" + encodeURIComponent(principal));
  if (!s.current(principal)) return;
  if (!r.ok) {
    paint(() =>
      html`<div class="detail">
        ${r.status === 403
          ? t("You don't have admin access.")
          : r.data?.message || t("Failed to load user ({status}).", { status: r.status })}
      </div>`,
    );
    return;
  }
  const d = r.data || {};
  s.pageShell({
    back,
    title: d.displayName || d.principalId || principal,
    context: [d.admin?.isAdmin ? s.labelRole(d.admin.role) : t("member"), d.scopeId || ""].filter(Boolean).join(" · "),
  });
  const personalScope = d.scopeId || "personal:" + principal;
  let onboarding = d.onboarding || "not_started";
  let busy = false;
  let hint = "";
  let resetHint = "";
  let credentials: any = null;
  let credentialError = "";
  let sort = "default";
  let selectedGrant: any = null;
  let usage: any = null;
  let usageRequest = 0;
  const stacked = (primary: any, secondary: any) =>
    html`<div>
      <div class="primaryline">${primary}</div>
      ${secondary ? html`<div class="subline">${secondary}</div>` : nothing}
    </div>`;
  const muted = (text: string) => html`<span class="subline">${text}</span>`;
  const credName = (id: string) => {
    const c = credentials?.credentials?.find((c: any) => c.id === id);
    return c ? c.service + (c.accountLabel ? " - " + c.accountLabel : "") : id;
  };
  async function setOnboarding(status: string) {
    busy = true;
    hint = t("Saving…");
    draw();
    try {
      const result = await s.api("PUT", "/api/users/" + encodeURIComponent(principal) + "/onboarding", { status });
      if (!result.ok) hint = result.data?.message || t("Failed ({status}).", { status: result.status });
      else {
        onboarding = result.data?.status || status;
        hint =
          status === "not_started"
            ? t("Reset. Onboarding will run on this person's next DM.")
            : t("Saved.");
      }
    } catch {
      hint = t("Network error. Try again.");
    } finally {
      busy = false;
      draw();
    }
  }
  async function reset() {
    if (
      !s.confirm(
        t("Delete this person's personal DM sessions (transcripts included) and clear their onboarding?\n\nThis is irreversible. Their channel history is untouched. On their next web visit they'll see the new-user welcome greeting, then onboarding."),
      )
    )
      return;
    busy = true;
    resetHint = t("Resetting…");
    draw();
    try {
      const result = await s.api("POST", "/api/users/" + encodeURIComponent(principal) + "/reset");
      if (!result.ok) resetHint = result.data?.message || t("Failed ({status}).", { status: result.status });
      else if (s.current(principal)) {
        s.reload(principal);
        return;
      }
    } catch {
      resetHint = t("Network error. Try again.");
    } finally {
      busy = false;
      draw();
    }
  }
  async function showUsage(grant: any) {
    const request = ++usageRequest;
    selectedGrant = grant;
    usage = null;
    draw();
    const result = await s.api(
      "GET",
      "/api/audit?scope=org:" +
        encodeURIComponent(s.orgId) +
        "&action=keychain.materialize&resource=" +
        encodeURIComponent("grant " + grant.id) +
        "&limit=2000",
    );
    if (request !== usageRequest) return;
    usage = result.ok ? result.data?.events || [] : [];
    draw();
  }
  function keychain() {
    if (credentialError) return credentialError;
    if (!credentials) return t("Loading credentials and grants…");
    if (credentials.enabled === false)
      return html`<div><p class="empty">${t("Keychain is not enabled.")}</p></div>`;
    const creds = credentials.credentials || [];
    const grants = credentials.grants || [];
    const group: Record<string, number> = { active: 0, used: 1, expired: 2, revoked: 3 };
    const timestamp = (g: any) => g.usedAt || g.revokedAt || g.createdAt || 0;
    const sorted = grants.slice().sort((a: any, b: any) => {
      if (sort === "mode") return String(a.mode).localeCompare(String(b.mode)) || timestamp(b) - timestamp(a);
      if (sort === "status") return String(a.status).localeCompare(String(b.status)) || timestamp(b) - timestamp(a);
      return (group[a.status] ?? 9) - (group[b.status] ?? 9) || timestamp(b) - timestamp(a);
    });
    return html`<div>
      ${card(
        t("Credentials ({count})", { count: formatNumber(creds.length) }),
        t("Logins this person registered in their keychain. Metadata only — secrets are never returned."),
        table(
          [t("Service"), t("Kind"), t("Origin"), t("Account"), t("Added")],
          creds
            .slice()
            .sort((a: any, b: any) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .map((c: any) => [
              { node: stacked(c.service, c.id), cls: "mono" },
              { node: muted(c.kind || t("unknown")) },
              { node: muted(c.origin || "-") },
              c.accountLabel || c.envKey || c.host || "-",
              { text: c.createdAt ? s.fmtTime(c.createdAt) : "-", cls: "num" },
            ]),
          t("No credentials registered."),
        ),
      )}${card(
        t("Grants ({count})", { count: formatNumber(grants.length) }),
        t("Purpose-bound grants this person issued. Every use — standing or one-time — is audited."),
        html`<div>
          ${
            selectedGrant
              ? html`<p class="kc-sortbar">
                    <button
                      type="button"
                      class="link"
                      @click=${() => {
                        ++usageRequest;
                        selectedGrant = null;
                        draw();
                      }}
                    >
                      ${t("‹ Back to grants")}
                    </button>
                  </p>
                  <p class="hint">
                    ${credName(selectedGrant.credentialId) + " · " + (selectedGrant.mode || "?") + " · " + t(GRANT_STATUS[selectedGrant.status] || "unknown") + " · " + t("grant {id}", { id: selectedGrant.id })}
                  </p>
                  ${
                    usage === null
                      ? html`<p class="empty">${t("Loading usage…")}</p>`
                      : table(
                          [t("When"), t("Used by"), t("Scope")],
                          usage.map((e: any) => [
                            { text: s.fmtTime(e.ts), cls: "num" },
                            { node: stacked(e.principalId, "") },
                            { node: muted(e.scopeLabel || "-") },
                          ]),
                          t("No recorded uses of this grant."),
                        )
                  }`
              : html`<p class="kc-sortbar">
                    ${t("Sort:")}
                    ${[
                      ["default", t("status group")],
                      ["mode", t("mode")],
                      ["status", t("status A-Z")],
                    ].map(
                      ([key, label], i) =>
                        html`${i ? " · " : ""}<button
                            type="button"
                            class=${"link" + (sort === key ? " kc-sort-active" : "")}
                            @click=${() => {
                              sort = key;
                              draw();
                            }}
                          >
                            ${label}
                          </button>`,
                    )}
                  </p>
                  ${table(
                    [t("Credential"), t("Mode"), t("Status"), t("Audience"), t("Purpose"), t("Uses")],
                    sorted.map((g: any) => [
                      { node: stacked(credName(g.credentialId), g.credentialId), cls: "mono" },
                      { node: muted(g.mode || t("unknown")) },
                      {
                        node: html`<span
                          ><span class=${"kc-dot kc-dot-" + (g.status || "unknown")}></span
                          >${t(GRANT_STATUS[g.status] || "unknown")}</span
                        >`,
                      },
                      { node: stacked(g.audienceScopeId, s.scopeKind(g.audienceScopeId)), cls: "mono" },
                      {
                        node: stacked(
                          g.purpose || "-",
                          g.usedBy ? t("used by {who}", { who: g.usedBy }) : "",
                        ),
                      },
                      {
                        action: {
                          label: t("View usage ›"),
                          title: t("Show recorded uses of this grant"),
                          run: () => showUsage(g),
                        },
                      },
                    ]),
                    t("No grants."),
                  )}`
          }
        </div>`,
      )}
    </div>`;
  }
  function draw() {
    if (!s.current(principal)) return;
    const cfg = d.config;
    const ruleN = cfg?.commandPolicy?.rules?.length || 0,
      allowN = cfg?.egress?.allowedHosts?.length || 0,
      denyN = cfg?.egress?.deniedHosts?.length || 0;
    const kinds: Record<string, string> = { completed: "ok", dismissed: "muted", pending: "warn", not_started: "info" };
    paint(() =>
      html`<div class="detail">
        <div style="margin:0 0 14px">${s.webUiAsButton(d.principalId || principal)}</div>
        <div class="user-resource-links" aria-label=${t("Personal workspace")}>
          ${[
            ["history", s.plural(d.stats?.sessions ?? 0, "conversation")],
            ["files", t("Files")],
            ["deployments", t("Apps")],
            ["crons", t("Crons")],
            ["skills", t("Skills")],
            ["memory", t("Memory")],
          ].map(([view, label]) => html`<a href=${s.stateToUrl({ view, scope: personalScope })}>${label} →</a>`)}
        </div>
        <div>${keychain()}</div>
        ${card(
          t("Configuration"),
          t("Policy and connectors for this person's personal scope."),
          html`<div>
              ${
                !cfg
                  ? html`<p class="empty">${t("Config store not available.")}</p>`
                  : table(
                      [t("Setting"), t("Value")],
                      [
                        [
                          t("Custom soul"),
                          { node: muted(cfg.hasSoul ? t("set · v{n}", { n: formatNumber(cfg.soulVersion || 1) }) : t("default")) },
                        ],
                        [
                          t("Command policy"),
                          cfg.commandPolicy
                            ? t("{rules} · {mode}", {
                                rules: t(ruleN === 1 ? "1 rule" : "{count} rules", { count: formatNumber(ruleN) }),
                                mode: t(cfg.commandPolicy.mode || "denylist"),
                              })
                            : t("default"),
                        ],
                        [t("Security posture"), t(cfg.securityPosture || "auto")],
                        [t("Sharing posture"), t(cfg.sharingPosture || "isolated")],
                        [
                          t("Egress overrides"),
                          allowN || denyN
                            ? t("{allow} allow · {deny} deny", {
                                allow: formatNumber(allowN),
                                deny: formatNumber(denyN),
                              })
                            : t("none"),
                        ],
                        [t("Base model"), t(cfg.baseModel || "org default")],
                        [t("Connectors linked"), formatNumber((cfg.connectors || []).length)],
                      ],
                      t("No config."),
                    )
              }
            </div>
            <button
              type="button"
              class="link"
              @click=${() => s.go({ view: "governance", scope: personalScope, session: null })}
            >
              ${t("Manage in Governance →")}
            </button>`,
        )}${card(
          t("Onboarding"),
          t("Personal-DM onboarding state. Reset to re-trigger the flow on this person's next DM, or wipe their DMs to replay the full new-user experience."),
          html`<div>
            <div class="obstatus">
              ${t("Current status:")}
              ${badge(onboarding === "not_started" ? t("not started") : t(onboarding), kinds[onboarding] || "muted")}
            </div>
            <div class="obactions">
              ${[
                [t("Reset (re-run on next DM)"), "not_started"],
                [t("Mark completed"), "completed"],
                [t("Mark dismissed"), "dismissed"],
              ].map(
                ([label, status], i) =>
                  html`<button
                    type="button"
                    class=${i === 0 ? "primary" : ""}
                    ?disabled=${busy}
                    @click=${() => setOnboarding(status)}
                  >
                    ${label}
                  </button>`,
              )}
            </div>
            <p class="hint">${hint}</p>
            <div class="obdivider"></div>
            <button type="button" class="danger-link" ?disabled=${busy} @click=${reset}>
              ${t("Reset to brand-new (delete this person's DMs) →")}
            </button>
            <p class="hint">${resetHint}</p>
          </div>`,
        )}
      </div>`,
    );
  }
  draw();
  try {
    const result = await s.api("GET", "/api/keychain?principal=" + encodeURIComponent(d.principalId || principal));
    if (!result.ok) throw new Error(result.data?.message || t("Failed to load credentials and grants."));
    credentials = result.data || {};
  } catch (error) {
    credentialError = (error as Error).message || t("Failed to load credentials and grants.");
  }
  draw();
}
