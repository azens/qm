import { html } from "lit";
import { t } from "../../chassis/src/i18n-lit.ts";
import { bareCard, table, pager, mount } from "./shared.ts";

export function errors(root: HTMLElement, data: any, s: Record<string, any>) {
  const rows = data.errors || [];
  const total = data.total ?? rows.length;
  const limit = data.limit || s.errorsPageSize;
  const offset = data.offset || 0;
  s.defaultShell({ count: s.plural(total, "error") });
  const content = table(
    [t("Category"), t("Code"), t("Message"), ...(s.all ? [t("Scope")] : []), t("Session"), t("Time")],
    rows.map((e: any) => {
      const scope = /^(personal|channel|team|org|group):.+/.test(e.scopeLabel || "") ? e.scopeLabel : null;
      const text = e.message || t("(no message)");
      return [
        e.category || "uncategorized",
        { text: e.code || "—", cls: "mono" },
        {
          node: html`<details class="error-message">
            <summary>
              <span class="error-preview">${s.firstLine(text, 160)}</span><span class="error-full">${text}</span>
            </summary>
          </details>`,
        },
        ...(s.all
          ? [scope ? { node: s.navLink(s.shortName(scope), { view: "errors", scope }) } : e.scopeLabel || t("System")]
          : []),
        e.sessionId
          ? { node: s.navLink(t("View session"), { view: "history", scope: scope || s.scope, session: e.sessionId }) }
          : "—",
        time(e.ts, s),
      ];
    }),
    s.all ? t("No errors recorded.") : t("No errors recorded for this scope."),
    undefined,
    { wrapClass: "errors-table " + (s.all ? "errors-all" : "errors-scoped") },
  );
  const pages = () => pager(total, limit, offset, (page) => s.go({ view: "errors", scope: s.scope, page }));
  mount(root, () => html`${pages()}${bareCard(content)}${pages()}`);
}

export function audit(root: HTMLElement, data: any, s: Record<string, any>) {
  const events = data.events || [];
  s.defaultShell({ count: s.plural(events.length, "event") });
  mount(root, () =>
    bareCard(
      table(
        [t("Administrator"), t("Action"), t("Resource"), ...(s.all ? [t("Scope")] : []), t("Time")],
        events.map((e: any) => [
          { text: e.principalId, cls: "mono" },
          {
            node: html`<span class=${/revoke|delete|deny|fail/.test(String(e.action || "")) ? "flag-err" : "subline"}
              >${e.action || t("event")}</span
            >`,
          },
          { text: e.status ? e.resource + " (" + e.status + ")" : e.resource || "", cls: "mono" },
          ...(s.all ? [s.shortName(e.scopeLabel)] : []),
          time(e.ts, s),
        ]),
        s.all ? t("No admin activity yet.") : t("No admin activity for this scope."),
      ),
    ),
  );
}

export function egress(root: HTMLElement, data: any, s: Record<string, any>) {
  const rows = data.records || [];
  const sources = data.bySource || {};
  s.defaultShell({
    stats: [
      [String(data.total ?? rows.length), t("Calls")],
      [String(data.denied ?? 0), t("denied requests")],
      [String(data.hosts ?? 0), t("Hosts")],
      [String(sources.broker ?? 0), t("broker requests")],
      [String(sources.firewall ?? 0), t("firewall requests")],
    ],
  });
  mount(root, () =>
    bareCard(
      table(
        [t("Host"), t("Status"), t("Source"), ...(s.all ? [t("Scope")] : []), t("Principal"), t("Detail"), t("Time")],
        rows.map((r: any) => [
          { text: r.host, cls: "mono" },
          {
            node: egressStatus(r),
          },
          { node: html`<span class="subline">${r.source || "firewall"}</span>` },
          ...(s.all ? [s.shortName(r.scopeLabel)] : []),
          { text: r.principalId || t("None"), cls: "mono" },
          { text: s.egressDetail(r), cls: "mono" },
          time(r.ts, s),
        ]),
        t("No egress in this scope yet."),
      ),
    ),
  );
}

function egressStatus(row: any) {
  let tone = row.status === "error" ? "flag-err" : "subline";
  let label = row.status && row.status !== "ok" ? row.status : t("allowed");
  if (row.allowed === false) {
    tone = "flag-warn";
    label = row.status || t("denied");
  }
  return html`<span class=${tone}>${label}</span>`;
}

function time(ts: number, s: Record<string, any>) {
  return { node: html`<span title=${s.fmtTime(ts)}>${s.relTime(ts)}</span>`, cls: "num" };
}
