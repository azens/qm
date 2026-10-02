import { html, nothing } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { t } from "../../chassis/src/i18n-lit.ts";
import { formatNumber, pluralize } from "../../chassis/src/i18n.ts";
import { card, table, renderer } from "./shared.ts";
import type { Context, Data } from "./artifacts.ts";
const badge = (text: unknown, tone = "muted", title = "") =>
  html`<span class=${"badge " + tone} title=${ifDefined(title || undefined)}>${text}</span>`;
const stacked = (name: unknown, desc: unknown) =>
  html`<div>
    <div class="primaryline">${name}</div>
    ${desc ? html`<div class="subline">${desc}</div>` : nothing}
  </div>`;
const count = (n: number, one: string, other: string) => pluralize(n, { one: t(one), other: t(other) });
export async function removeSkill(s: Data, c: Context) {
  if (
    !confirm(
      t("Remove '{name}' from {scope}? It stops being available to agents (kept for audit).", {
        name: s.name || s.id,
        scope: c.dirLabel(s.ownerScopeId) || s.ownerScopeId,
      }),
    )
  )
    return;
  try {
    const response = await c.api(
      "DELETE",
      "/api/skills/" + encodeURIComponent(s.id) + "?scope=" + encodeURIComponent(s.ownerScopeId || c.scope),
    );
    if (!response.ok) {
      alert(response.data?.message || t("1 scope(s) could not be removed."));
      return;
    }
    c.invalidate();
    await c.reload();
  } catch {
    alert(t("Could not remove skill."));
  }
}
export async function skillDetail(root: HTMLElement, rep: Data, group: Data[], c: Context) {
  root.replaceChildren();
  const paint = renderer(root);
  paint(() => html`<div class="loadingline">${t("Loading {name}…", { name: rep.name || rep.id })}</div>`);
  const response = await c.api(
    "GET",
    "/api/skills/" + encodeURIComponent(rep.id) + "?scope=" + encodeURIComponent(rep.ownerScopeId || c.scope),
  );
  if (!response.ok || !response.data) {
    paint(
      () => html`<p class="empty">
        ${response.status === 403 ? t("You don't administer this skill's scope.") : t("Couldn't load this skill.")}
      </p>`,
    );
    return;
  }
  const k = response.data;
  const by = () => {
    if (k.pack)
      return t("from {label}", { label: c.packRepoLabel(k.pack.url) || t("pack {id}", { id: c.shortId(k.pack.id, 8) }) });
    return k.createdBy?.startsWith("system:")
      ? t("built-in")
      : t("by {who}", { who: k.createdBy || t("None") });
  };
  paint(() =>
    card(
      k.name || k.id,
      "",
      html`<div>
        <div class="badges">
          ${c.statusBadge(k.status)}${badge("v" + k.version)}${badge(by())}${badge(t("skill {id}", { id: c.shortId(k.id, 16) }))}
        </div>
        ${k.description ? html`<p class="metric-note">${k.description}</p>` : nothing}${card(
          t("Scopes ({count})", { count: formatNumber(group.length) }),
          t("Every scope this skill is installed in. Remove takes it out of that scope only."),
          table(
            [t("Scope"), t("Status"), t("Version"), ""],
            [...group]
              .sort((a, b) =>
                (() => {
                  if (c.scopeKind(a.ownerScopeId) === "org") return -1;
                  return c.scopeKind(b.ownerScopeId) === "org"
                    ? 1
                    : (a.ownerScopeId || "").localeCompare(b.ownerScopeId || "");
                })(),
              )
              .map((g) => [
                c.scopeCell(g.ownerScopeId),
                { node: c.statusBadge(g.status) },
                { text: g.version != null ? "v" + g.version : t("None"), cls: "num" },
                {
                  node:
                    g.status === "archived"
                      ? badge(t("archived"))
                      : html`<button type="button" class="rowbtn danger" @click=${() => removeSkill(g, c)}>
                          ${t("Remove")}
                        </button>`,
                },
              ]),
            t("None"),
          ),
        )}${card(
          t("Capabilities"),
          t("What the skill is allowed to reach. Granted at review time."),
          table(
            [t("Capability"), t("Status")],
            (k.requiredCapabilities || []).map((cap: string) => [
              { text: cap, cls: "mono" },
              {
                node: (k.grantedCapabilities || []).includes(cap)
                  ? badge(t("granted"), "ok")
                  : badge(t("not granted"), "warn"),
              },
            ]),
            t("Requires no capabilities."),
          ),
        )}${
          k.approvals?.length
            ? card(
                t("Approvals"),
                t("Reviewers who signed off on this skill."),
                table(
                  [t("Reviewer")],
                  k.approvals.map((a: string) => [{ text: a, cls: "mono" }]),
                  "",
                ),
              )
            : nothing
        }${card(t("Instructions"), t("The SKILL.md the agent reads when this skill is in play."), html`<pre class="skillbody" style="white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:12px;margin:0">${k.body || t("(empty)")}</pre>`)}
      </div>`,
    ),
  );
  root.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
export async function mountPacks(root: HTMLElement, c: Context) {
  const response = await c.api("GET", "/api/skill-packs");
  if (!root.isConnected) return;
  packs(root, (response.ok && response.data?.packs) || [], c);
}
export function packs(root: HTMLElement, rows: Data[], c: Context) {
  const paint = renderer(root);
  const detail = document.createElement("div");
  const draft = { url: "", ref: "", exclude: "", slug: "", tier: "third-party" };
  let advanced = false,
    registering = false,
    message: () => string = () => "",
    tone = "",
    menu: string | null = null,
    menuTop = 0,
    menuLeft = 0;
  const statuses = new Map<string, Data>();
  const pending = new Set<string>();
  const closeMenu = () => {
    if (menu) {
      menu = null;
      draw();
    }
  };
  const abort = new AbortController();
  document.addEventListener("click", closeMenu, { signal: abort.signal });
  document.addEventListener("scroll", closeMenu, { signal: abort.signal, capture: true });
  window.addEventListener("resize", closeMenu, { signal: abort.signal });
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      abort.abort();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const change = (key: keyof typeof draft) => (e: Event) => {
    draft[key] = (e.target as HTMLInputElement).value;
    draw();
  };
  const register = async () => {
    if (registering) return;
    if (!draft.url.trim()) {
      message = () => t("A repo URL is required.");
      tone = "err";
      draw();
      return;
    }
    const submitted = JSON.stringify(draft);
    registering = true;
    message = () => t("Registering…");
    tone = "";
    draw();
    const excluded = draft.exclude
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      const response = await c.api("POST", "/api/skill-packs", {
        url: draft.url.trim(),
        ...(draft.ref.trim() ? { ref: draft.ref.trim() } : {}),
        ...(excluded.length ? { config: { exclude: excluded } } : {}),
        ...(draft.slug.trim() ? { authCredentialSlug: draft.slug.trim() } : {}),
        ...(draft.tier !== "third-party" ? { trustTier: draft.tier } : {}),
      });
      if (!response.ok) {
        message = () => response.data?.message || t("Failed ({status}).", { status: response.status });
        tone = "err";
      } else {
        c.invalidate();
        if (JSON.stringify(draft) === submitted) await c.reload();
        else {
          message = () => t("Pack registered. Your newer changes have not been registered.");
          tone = "ok";
        }
      }
    } catch {
      message = () => t("Registration failed.");
      tone = "err";
    } finally {
      registering = false;
      draw();
    }
  };
  const act = async (s: Data, action: string) => {
    menu = null;
    if (action === "browse") {
      draw();
      void browsePack(s, detail, c);
      return;
    }
    if (pending.has(s.id)) return;
    if (action === "remove" && !confirm(t("Remove this pack and archive its imported skills?"))) {
      draw();
      return;
    }
    pending.add(s.id);
    if (action === "sync") statuses.set(s.id, { text: () => t("syncing…"), tone: "saving" });
    draw();
    try {
      const path = "/api/skill-packs/" + encodeURIComponent(s.id);
      const response = await c.api(
        (() => {
          if (action === "remove") return "DELETE";
          return action === "sync" ? "POST" : "PATCH";
        })(),
        path + (action === "sync" ? "/sync" : ""),
        (() => {
          if (action === "sync") return {};
          return action === "track" ? { syncMode: s.syncMode === "tracked" ? "pinned" : "tracked" } : undefined;
        })(),
      );
      if (!response.ok) {
        statuses.set(s.id, {
          text: () =>
            t(action === "sync" ? "Sync failed: {message}" : "Failed: {message}", {
              message: response.data?.message || response.status,
            }),
          tone: "err",
        });
        return;
      }
      if (action === "sync") {
        const data = response.data || {},
          n = (data.imported || []).length,
          u = (data.updated || []).length,
          a = (data.archived || []).length;
        statuses.set(s.id, {
          text: () =>
            n || u || a
              ? "✓ " +
                t("{count} new", { count: formatNumber(n) }) +
                (u ? " · " + t("{count} updated", { count: formatNumber(u) }) : "") +
                (a ? " · " + t("{count} removed", { count: formatNumber(a) }) : "")
              : t("✓ up to date"),
          tone: "ok",
        });
        setTimeout(() => {
          c.invalidate();
          if (root.isConnected) c.reload();
        }, 1200);
      } else {
        c.invalidate();
        await c.reload();
      }
    } catch {
      statuses.set(s.id, { text: () => t("Request failed."), tone: "err" });
    } finally {
      pending.delete(s.id);
      draw();
    }
  };
  const input = (key: keyof typeof draft, placeholder: string, title?: string) =>
    html`<input
      type="text"
      placeholder=${placeholder}
      title=${ifDefined(title)}
      aria-label=${placeholder}
      spellcheck="false"
      .value=${draft[key]}
      @input=${change(key)}
    />`;
  const draw = () =>
    paint(() => {
      const delta = (counts: Data) =>
        t("last sync: {imported} new · {updated} updated · {skipped} skipped", {
          imported: formatNumber(counts.imported || 0),
          updated: formatNumber(counts.updated || 0),
          skipped: formatNumber(counts.skipped || 0),
        }) + (counts.archived ? " · " + t("{count} removed", { count: formatNumber(counts.archived) }) : "");
      return html`${card(
        t("Skill packs"),
        t("Register a repository, then choose which skills to import into each scope."),
        html`<div>
          <div class="pack-register">
            ${input("url", t("Register a pack: paste a git repo URL of SKILL.md files, then Browse it into scopes"))}<button
              type="button"
              class=${"linkish" + (advanced ? " open" : "")}
              aria-expanded=${String(advanced)}
              @click=${() => {
                advanced = !advanced;
                draw();
              }}
            >
              ${t("Advanced") + (!advanced && (draft.ref.trim() || draft.exclude.trim() || draft.slug.trim() || draft.tier !== "third-party") ? " •" : "")}</button
            ><button type="button" class="primary" ?disabled=${registering} @click=${register}>${t("Register")}</button
            ><span class=${"status" + (tone ? " " + tone : "")}>${message()}</span>
          </div>
          <div class=${"pack-adv" + (advanced ? "" : " hidden")}>
            ${input("ref", t("ref (branch or SHA)"), t("Pin to a branch or full 40-hex commit SHA. Blank = the repo's default branch."))}${input("exclude", t("exclude globs, comma-separated"), t("e.g. trusted/*"))}${input("slug", t("deploy-token slug"), t("Private-repo deploy-token credential slug. Blank = your connected GitHub account."))}<select
              title=${t("Trust tier")}
              .value=${draft.tier}
              @change=${change("tier")}
            >
              <option value="third-party">${t("trust: third-party")}</option>
              <option value="internal">${t("trust: internal")}</option>
            </select>
          </div>
          ${table(
            [t("Pack"), t("Skills"), t("Trust"), t("Status"), ""],
            rows.map((s) => {
              const li = s.lastImport,
                counts = li?.counts || {},
                tracked = s.syncMode === "tracked";
              const lastSync = li ? delta(counts) : "";
              const status =
                statuses.get(s.id) ||
                (() => {
                  if (li?.status === "error")
                    return {
                      text: () => t("Error: {message}", { message: li.error || t("sync failed") }),
                      tone: "err",
                      title: li.error || "",
                    };
                  return s.updateAvailable
                    ? {
                        text: () => t("update available"),
                        tone: "dirty",
                        title: t("Upstream advanced past the imported commit. Sync now (or turn on Auto-sync) to apply."),
                      }
                    : {
                        text: () => (li ? t("up to date") : t("not imported")),
                        tone: "muted",
                        title: lastSync,
                      };
                })();
              return [
                {
                  node: html`<span class="pack-name" title=${s.url + (lastSync ? "\n" + lastSync : "")}
                    ><strong>${c.packRepoLabel(s.url) || s.url}</strong
                    >${s.ref ? html`<span class="subline">${" @ " + c.shortId(s.ref, 10)}</span>` : nothing}</span
                  >`,
                },
                {
                  node: html`<span
                    title=${ifDefined(
                      s.available != null
                        ? t("{imported} imported · {available} available (eligible) in this pack", {
                            imported: formatNumber(s.importedCount || 0),
                            available: formatNumber(s.available),
                          })
                        : undefined,
                    )}
                    >${s.available != null ? t("{imported} of {available}", { imported: formatNumber(s.importedCount || 0), available: formatNumber(s.available) }) : t("n/a")}</span
                  >`,
                  cls: "num",
                },
                { text: tracked ? t("{tier} · auto-sync", { tier: s.trustTier }) : s.trustTier, cls: "subline" },
                {
                  node: html`<span class=${"status " + status.tone} title=${ifDefined(status.title || undefined)}
                    >${status.text()}</span
                  >`,
                },
                {
                  node: html`<div class="ovwrap">
                    <button
                      type="button"
                      class="rowbtn"
                      aria-label=${t("Actions")}
                      aria-haspopup="menu"
                      aria-expanded=${String(menu === s.id)}
                      @click=${(e: MouseEvent) => {
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        menu = menu === s.id ? null : s.id;
                        menuTop = r.bottom + 4;
                        menuLeft = r.right;
                        draw();
                        const el = root.querySelector<HTMLElement>(".ovmenu:not(.hidden)");
                        if (el) {
                          menuLeft = Math.max(8, r.right - el.offsetWidth);
                          draw();
                        }
                      }}
                    >
                      ⋯
                    </button>
                    <div
                      class=${"ovmenu" + (menu === s.id ? "" : " hidden")}
                      role="menu"
                      style=${`top:${menuTop}px;left:${menuLeft}px`}
                    >
                      ${[
                        ["browse", t("Browse skills…")],
                        ["sync", t("Sync now")],
                        ["track", tracked ? t("Turn off auto-sync") : t("Turn on auto-sync")],
                        ["remove", t("Remove pack")],
                      ].map(
                        ([action, label]) =>
                          html`<button
                            type="button"
                            class=${ifDefined(action === "remove" ? "danger" : undefined)}
                            ?disabled=${pending.has(s.id)}
                            @click=${(e: MouseEvent) => {
                              e.stopPropagation();
                              void act(s, action);
                            }}
                          >
                            ${label}
                          </button>`,
                      )}
                    </div>
                  </div>`,
                  cls: "num",
                },
              ];
            }),
            t("No packs yet. Register one above."),
          )}
        </div>`,
      )}${detail}`;
    });
  draw();
}
export async function browsePack(pack: Data, root: HTMLElement, c: Context) {
  root.replaceChildren();
  const paint = renderer(root);
  paint(() => html`<div class="loadingline">${t("Fetching {url}…", { url: pack.url })}</div>`);
  const response = await c.api("GET", "/api/skill-packs/" + encodeURIComponent(pack.id) + "/catalog");
  if (!response.ok || !response.data) {
    paint(() => html`<p class="empty">${response.data?.message || t("Couldn't browse ({status}).", { status: response.status })}</p>`);
    return;
  }
  const plan = response.data,
    candidates: Data[] = plan.candidates || [],
    counts = plan.counts || {};
  const selectedScopes = new Set<string>(["org:" + c.orgId]);
  const selected = new Set<string>();
  let filter = "all",
    busy = false,
    message: () => string = () => "",
    tone = "",
    closed = false;
  const all = (row: Data) =>
    selectedScopes.size > 0 && [...selectedScopes].every((scope) => (row.importedScopes || []).includes(scope));
  const eligible = (row: Data) => row.eligible && !all(row);
  let previousEligible = new Set<string>();
  const recompute = () => {
    const next = new Set(candidates.filter(eligible).map((r) => r.upstreamName));
    for (const r of candidates) {
      if (!next.has(r.upstreamName)) selected.delete(r.upstreamName);
      else if (!previousEligible.has(r.upstreamName)) selected.add(r.upstreamName);
    }
    previousEligible = next;
    draw();
  };
  const reasons = (): Record<string, Data> => ({
    all: { label: () => t("all"), tone: "muted", help: () => t("Show every skill.") },
    eligible: {
      label: () => t("eligible"),
      tone: "ok",
      help: () => t("Eligible and not yet in the selected scope(s). Importing adds it there."),
    },
    imported: {
      label: () => t("imported"),
      tone: "info",
      help: () => t("Already imported into the selected scope(s). Sync refreshes them; un-index to remove."),
    },
    scope: {
      label: () => t("personal-scoped"),
      tone: "muted",
      help: () => t("Held back: declares a personal/owner scope, so it isn't imported as a shared pack skill."),
    },
    private: {
      label: () => t("private"),
      tone: "muted",
      help: () => t("Held back: marked owner-only / agent-only."),
    },
    collision: {
      label: () => t("collision"),
      tone: "muted",
      help: () => t("Held back: the name matches an existing platform or seed skill."),
    },
    "binary-asset": {
      label: () => t("binary files"),
      tone: "muted",
      help: () => t("Held back: contains binary files (import is text-only)."),
    },
    malformed: {
      label: () => t("malformed"),
      tone: "muted",
      help: () => t("Held back: missing or unreadable SKILL.md frontmatter."),
    },
  });
  const choices = [
    { scopeId: "org:" + c.orgId, label: t("org-wide") },
    ...c.scopeRows().map((r: Data) => ({ scopeId: r.scopeId, label: r.label || c.dirLabel(r.scopeId) || r.scopeId })),
  ];
  const picker = c.buildScopeMultiSelect(choices, selectedScopes, recompute);
  const importSelected = async () => {
    if (busy) return;
    if (!selectedScopes.size || !selected.size) {
      message = () =>
        !selectedScopes.size ? t("Pick at least one scope to add skills to.") : t("Select at least one skill.");
      tone = "err";
      draw();
      return;
    }
    busy = true;
    message = () => t("Importing…");
    tone = "";
    draw();
    const scopes = [...selectedScopes],
      names = [...selected];
    try {
      const result = await c.api("POST", "/api/skill-packs/" + encodeURIComponent(pack.id) + "/import", {
        selected: names.length === candidates.filter(eligible).length ? "all" : names,
        scopeIds: scopes,
      });
      if (!result.ok) {
        message = () => result.data?.message || t("Import failed ({status}).", { status: result.status });
        tone = "err";
      } else {
        const added = result.data.imported?.length ?? 0;
        message = () =>
          t(scopes.length > 1 ? "✓ {added} skill added across {count} scopes" : "✓ {added} skill added", {
            added: formatNumber(added),
            count: formatNumber(scopes.length),
          });
        tone = "ok";
        c.invalidate();
        setTimeout(() => {
          if (root.isConnected && !closed) c.reload();
        }, 1500);
      }
    } catch {
      message = () => t("Import failed.");
      tone = "err";
    } finally {
      busy = false;
      draw();
    }
  };
  const action = (bottom = false) =>
    html`<div
      style=${"display:flex;flex-direction:column;align-items:flex-start;gap:6px;" + (bottom ? "margin-top:10px" : "")}
    >
      <button type="button" class="primary" ?disabled=${busy} @click=${importSelected}>${t("Import selected")}</button
      ><span class=${"status" + (tone ? " " + tone : "")}>${message()}</span>
    </div>`;
  const draw = () => {
    if (closed) return;
    paint(() => {
      const importable = candidates.filter(eligible),
        selectedCount = importable.filter((r) => selected.has(r.upstreamName)).length;
      const shown = candidates.filter(
        (r) =>
          filter === "all" ||
          (() => {
            if (all(r)) return "imported";
            return r.eligible ? "eligible" : r.excludeReason || "excluded";
          })() === filter,
      );
      const reasonList = reasons();
      return html`<section class="card" style="position:relative">
        <div class="head">
          <h2>${t("Browse: {url}", { url: pack.url })}</h2>
          <p>
            ${t("Choose target scopes, then import. Eligible skills are added to every selected scope; excluded skills show why. They appear on the Skills page once imported.")}
          </p>
        </div>
        <div class="body">
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 4px">
              <span style="font-size:12px;opacity:0.7">${t("Add to scopes:")}</span>${picker}
            </div>
            ${
              plan.bundlePaths?.length
                ? html`<details style="margin:8px 0">
                    <summary>
                      ${count(plan.bundlePaths.length, "{count} shared pack file", "{count} shared pack files") + " " + t("(contained under a pack-owned directory)")}
                    </summary>
                    <pre
                      style="max-height:180px;overflow:auto;font-size:11px;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)"
                    >
${plan.bundlePaths.join("\n")}</pre>
                  </details>`
                : nothing
            }
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:10px 0 16px">
              <div class="badges" style="flex:1">
                ${Object.entries(reasonList)
                  .filter(
                    ([key]) =>
                      key === "all" ||
                      key === "eligible" ||
                      (key === "imported" ? candidates.some((r) => r.importedScopes?.length) : counts[key]),
                  )
                  .map(
                    ([key, reason]) =>
                      html`<span
                        class=${"badge " + reason.tone}
                        style=${"cursor:pointer;" + (filter === key ? "background:var(--text);color:#fff;border-color:var(--text)" : "")}
                        title=${reason.help() + " " + (key === "all" ? "" : t("Click to show only these."))}
                        @click=${() => {
                          filter = key;
                          draw();
                        }}
                        >${
                          (() => {
                            if (key === "all") return formatNumber(candidates.length);
                            return formatNumber(
                              (() => {
                                if (key === "eligible") return importable.length;
                                return key === "imported" ? candidates.filter(all).length : counts[key] || 0;
                              })(),
                            );
                          })() +
                          " " +
                          reason.label()
                        }</span
                      >`,
                  )}
              </div>
              ${action()}
            </div>
            <div>
              ${table(
                [
                  html`<input
                    type="checkbox"
                    title=${t("Select / deselect all importable skills")}
                    .checked=${importable.length > 0 && selectedCount === importable.length}
                    .indeterminate=${selectedCount > 0 && selectedCount < importable.length}
                    @change=${(e: Event) => {
                      const on = (e.target as HTMLInputElement).checked;
                      for (const row of importable) {
                        if (on) selected.add(row.upstreamName);
                        else selected.delete(row.upstreamName);
                      }
                      draw();
                    }}
                  />`,
                  t("Skill"),
                  "",
                ],
                shown.map((row) => [
                  {
                    node: html`<input
                      type="checkbox"
                      data-name=${row.upstreamName}
                      .checked=${selected.has(row.upstreamName)}
                      ?disabled=${!eligible(row)}
                      @change=${(e: Event) => {
                        if ((e.target as HTMLInputElement).checked) selected.add(row.upstreamName);
                        else selected.delete(row.upstreamName);
                        draw();
                      }}
                    />`,
                  },
                  { node: stacked(row.upstreamName, row.normalized?.manifest?.description || "") },
                  {
                    node: (() => {
                      if (all(row))
                        return badge(
                          t("imported"),
                          "info",
                          t("Already imported into the selected scope(s): {scopes}", {
                            scopes: (row.importedScopes || []).join(", "),
                          }),
                        );
                      return row.eligible
                        ? badge(
                            t("eligible"),
                            "ok",
                            [...selectedScopes].some((s) => (row.importedScopes || []).includes(s))
                              ? t("Imported into {scopes}. Importing adds it to the other selected scope(s).", {
                                  scopes: (row.importedScopes || []).join(", "),
                                })
                              : "",
                          )
                        : badge(
                            reasonList[row.excludeReason]?.label() || row.excludeReason || t("excluded"),
                            "warn",
                            reasonList[row.excludeReason]?.help() || "",
                          );
                    })(),
                  },
                ]),
                filter === "all"
                  ? t("No skills found in this pack.")
                  : t("No {label} skills.", { label: reasonList[filter]?.label() || filter }),
              )}
            </div>
            ${action(true)}
          </div>
        </div>
        <button
          type="button"
          title=${t("Close")}
          aria-label=${t("Close browse")}
          style="position:absolute;top:10px;right:12px;border:none;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:var(--text);opacity:0.55;padding:4px"
          @mouseenter=${(e: Event) => {
            (e.target as HTMLElement).style.opacity = "1";
          }}
          @mouseleave=${(e: Event) => {
            (e.target as HTMLElement).style.opacity = "0.55";
          }}
          @click=${() => {
            closed = true;
            paint(nothing);
          }}
        >
          ✕
        </button>
      </section>`;
    });
  };
  recompute();
  root.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
