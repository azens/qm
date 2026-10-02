import { html, nothing } from "lit";
import { t } from "../../chassis/src/i18n-lit.ts";
import { table, card, mount } from "./shared.ts";

export function metrics(root: HTMLElement, d: any, s: Record<string, any>) {
  const n = (text: any) => ({ text, cls: "num" });
  const line = (parts: any[]) => html`<div class="statline">${parts.filter(Boolean).join(" · ")}</div>`;
  const stacked = (title: string, description: string) => ({
    node: html`<div>
      <div class="primaryline">${title}</div>
      ${description ? html`<div class="subline">${description}</div>` : nothing}
    </div>`,
  });
  if (s.phase) {
    const p = (d.phases || []).find((p: any) => p.phase === s.phase);
    s.pageShell({
      back: { label: t("← Metrics"), onClick: () => s.go({ view: "metrics", scope: s.scope, session: null }) },
      title: s.phaseLabel(s.phase),
      context: s.phaseDesc(s.phase),
    });
    if (!p?.count) {
      mount(
        root,
        () =>
          html`<p class="empty">
            ${t("No {phase} samples in this scope yet.", {
              phase: s.phaseLabel(s.phase).toLowerCase(),
            })}
          </p>`,
      );
      return;
    }
    const bins = (p.dist || []).map((b: any, i: number, all: any[]) => ({
      ...b,
      label: b.le == null ? t("> {ms}", { ms: s.fmtMs(all[i - 1]?.le) }) : t("≤ {ms}", { ms: s.fmtMs(b.le) }),
    }));
    while (bins.length && !bins[bins.length - 1].count) bins.pop();
    const max = Math.max(...bins.map((b: any) => b.count), 1);
    const worst = p.worst || [];
    mount(
      root,
      () =>
        html`${line([
          t("{count} turns", { count: Number(p.count).toLocaleString() }),
          s.fmtMs(p.p50) + " p50",
          s.fmtMs(p.p95) + " p95",
          s.fmtMs(p.p99) + " p99",
        ])}${card(
          t("Distribution"),
          t("Where the samples land."),
          bins.length
            ? html`<div class="dist">
                ${bins.map(
                (b: any) =>
                  html`<div class="dist-row">
                    <span class="dist-label">${b.label}</span
                    ><span class="dist-track"
                      ><span
                        class="dist-bar"
                        style=${"width:" + Math.max((b.count / max) * 100, b.count ? 1 : 0) + "%"}
                      ></span></span
                    ><span class="dist-count">${b.count ? Number(b.count).toLocaleString() : ""}</span>
                  </div>`,
              )}
              </div>`
            : html`<p class="empty">${t("No samples.")}</p>`,
        )}${card(
          t("By day"),
          t("Daily percentiles (UTC)."),
          table(
            [t("Day"), t("Turns"), "p50", "p95", "p99"],
            (p.daily || [])
              .slice()
              .reverse()
              .map((r: any) => [
                { text: r.day, cls: "mono" },
                n(Number(r.count).toLocaleString()),
                n(s.fmtMs(r.p50)),
                n(s.fmtMs(r.p95)),
                n(s.fmtMs(r.p99)),
              ]),
            t("No daily samples."),
          ),
        )}${card(
          t("Worst recent turns"),
          worst.some((w: any) => w.sessionId)
            ? t("The slowest samples. Each opens the turn's transcript.")
            : t("The slowest samples."),
          table(
            [s.phaseLabel(s.phase), t("Total turn"), t("Scope"), t("Machine"), t("Time")],
            worst.map((w: any) => [
              n(s.fmtMs(w.ms)),
              n(w.totalMs ? s.fmtMs(w.totalMs) : t("n/a")),
              s.shortName(w.scopeLabel),
              { text: s.turnKindWords(w) || t("None"), cls: "subline" },
              n(s.relTime(w.ts)),
            ]),
            t("No samples."),
            (i) => {
              const w = worst[i];
              if (w.sessionId)
                s.go({
                  view: "history",
                  scope: w.scopeLabel || s.scope,
                  session: w.sessionId,
                  ...(w.turnSeq != null ? { turn: w.turnSeq } : {}),
                });
            },
          ),
        )}`,
    );
    return;
  }
  s.defaultShell({ count: s.plural(d.throughput?.total ?? 0, "run") });
  const c = d.cache,
    phases = d.phases || [],
    tp = d.throughput || {},
    an = d.anatomy;
  const mix = () => {
    if (!an?.composite?.totalTurns) return nothing;
    const a = an.traceA || {},
      b = an.traceB || {},
      composite = an.composite;
    const share = (value: number) => s.fmtPct((value || 0) / composite.totalTurns);
    const fmtX = (value: number) => (value == null ? t("n/a") : String(Math.round(value * 10) / 10));
    return card(
      t("Turn mix"),
      t("How often turns provision a machine, and what each kind of turn costs."),
      table(
        [t("Kind of turn"), t("Share"), t("Turns"), t("Median"), t("Model calls"), t("Tool calls")],
        [
          [
            stacked(t("Turns that never touched a machine"), t("pure conversation, no tools")),
            n(share(a.samples)),
            n(String(a.samples || 0)),
            n(s.fmtMs(a.total?.p50)),
            n(fmtX(a.modelCalls?.avg)),
            n(fmtX(a.toolCalls?.avg)),
          ],
          [
            stacked(
              t("Turns that used a machine"),
              t("{warm} on a warm machine ({warmMs} median resume) · {cold} booted cold ({coldMs} median boot)", {
                warm: b.warm || 0,
                warmMs: s.fmtMs(b.provisionWarm?.p50),
                cold: b.cold || 0,
                coldMs: s.fmtMs(b.provisionCold?.p50),
              }),
            ),
            n(share(b.samples)),
            n(String(b.samples || 0)),
            n(s.fmtMs(b.total?.p50)),
            n(fmtX(b.modelCalls?.avg)),
            n(fmtX(b.toolCalls?.avg)),
          ],
          [
            stacked(t("All turns"), t("the blended average")),
            n("100%"),
            n(String(composite.totalTurns || 0)),
            n(s.fmtMs(composite.total?.p50)),
            n(fmtX(composite.modelCalls?.avg)),
            n(fmtX(composite.toolCalls?.avg)),
          ],
        ],
        t("No turns sampled."),
      ),
    );
  };
  mount(
    root,
    () =>
      html`${
        c?.samples
          ? line([
              t("{value} prompt-cache hit ratio", {
                value: c.avgHitRatio == null ? t("n/a") : s.fmtPct(c.avgHitRatio),
              }),
              t("{value} token-weighted", {
                value: c.pooledHitRatio == null ? t("n/a") : s.fmtPct(c.pooledHitRatio),
              }),
              t("{value} stable-prefix miss rate", {
                value: c.missRate == null ? t("n/a") : s.fmtPct(c.missRate),
              }),
              t("{count} miss turns", { count: c.missTurns || 0 }),
              t("{count} turns with cache data", { count: c.samples || 0 }),
              t("{value} read", { value: s.fmtTokens(c.cacheReadTotal || 0) }),
              t("{value} written", { value: s.fmtTokens(c.cacheWriteTotal || 0) }),
            ])
          : nothing
      }${table(
        [t("Phase"), "p50", "p95", "p99", t("Turns"), t("Trend")],
        phases.map((p: any) => [
          stacked(s.phaseLabel(p.phase), s.phaseDesc(p.phase)),
          n(s.fmtMs(p.p50)),
          n(s.fmtMs(p.p95)),
          n(s.fmtMs(p.p99)),
          n(p.count ? Number(p.count).toLocaleString() : t("n/a")),
          { node: s.sparkline(p.daily), cls: "num" },
        ]),
        t("No turn metrics in this scope yet."),
        (i) => s.go({ view: "metrics", scope: s.scope, session: null, phase: phases[i].phase }),
      )}${mix()}${
        tp.total
          ? line([
              t("{count} runs", { count: tp.total ?? 0 }),
              t("{count} done", { count: tp.done ?? 0 }),
              t("{count} failed", { count: tp.failed ?? 0 }),
              t("{value} failure rate", { value: s.fmtPct(tp.failureRate) }),
            ])
          : nothing
      }`,
  );
}
