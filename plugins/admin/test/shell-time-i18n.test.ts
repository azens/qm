import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setLocale, translate } from "../../chassis/src/i18n.ts";

const shellLines = readFileSync(new URL("../public/index.html", import.meta.url), "utf8").split("\n");
const start = shellLines.findIndex((line) => line.includes("const sameLocalDate"));
const end = shellLines.findIndex((line, i) => i > start && line.includes("const fmtMs"));
assert.ok(start > 0 && end > start, "the shell time helpers are locatable");

const helpers = shellLines
  .slice(start, end)
  .join("\n")
  .replace(/\bUI_LOCALE\b/g, "() => locale");

const build = (locale: string) =>
  new Function(
    "_t",
    "locale",
    `${helpers}
return { relTime, fmtHistoryCreated };`,
  )(translate, locale) as {
    relTime(ts: number | null): string;
    fmtHistoryCreated(createdAt: number | null, lastActivity: number | null): string;
  };

const sameDayAt = (hoursAgo: number): number => {
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo, 15, 0, 0);
  return d.getTime();
};

const yesterdayAt = (): number => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(9, 5, 0, 0);
  return d.getTime();
};

test("the admin shell relative-time helper renders Chinese, not the English key", () => {
  setLocale("zh-CN");
  try {
    const { relTime, fmtHistoryCreated } = build("zh-CN");

    assert.equal(relTime(null), "从未");
    assert.equal(fmtHistoryCreated(null, null), "从未");

    assert.equal(relTime(Date.now() - 20_000), "刚刚");
    assert.equal(relTime(Date.now() - 7 * 60_000), "7 分钟");
    assert.match(relTime(sameDayAt(3)), /^今天 /);
    assert.match(relTime(yesterdayAt()), /^昨天 /);

    for (const rendered of [
      relTime(null),
      relTime(Date.now() - 20_000),
      relTime(Date.now() - 7 * 60_000),
      relTime(sameDayAt(3)),
      relTime(yesterdayAt()),
      fmtHistoryCreated(null, null),
    ]) {
      assert.ok(
        !/^[\x20-\x7e]+$/.test(rendered),
        `expected Chinese output, got ASCII-only ${JSON.stringify(rendered)}`,
      );
    }
  } finally {
    setLocale("en");
  }
});

test("the admin shell relative-time helper still renders English under the en locale", () => {
  setLocale("en");
  const { relTime } = build("en");
  assert.equal(relTime(null), "Never");
  assert.equal(relTime(Date.now() - 7 * 60_000), "7 min");
  assert.match(relTime(sameDayAt(3)), /^Today /);
  assert.match(relTime(yesterdayAt()), /^Yesterday /);
});

test("the org-scope label in governance confirmations is translated", () => {
  setLocale("zh-CN");
  try {
    assert.equal(translate("Organization · {scope}", { scope: "acme" }), "组织 · acme");
    assert.equal(translate("Allow external Slack audiences?"), "允许外部 Slack 参与者吗？");
    assert.equal(translate("Search…"), "搜索…");
    assert.equal(translate("judgments"), "判断记录");
    assert.equal(translate("background runs"), "后台运行");
    assert.equal(translate("{count} error", { count: 4 }), "4 个错误");
    assert.equal(translate("{count} errors", { count: 4 }), "4 个错误");
  } finally {
    setLocale("en");
  }
});

test("the governance scope-name helper renders a translated org label", () => {
  const at = shellLines.findIndex((line) => line.includes("function governanceScopeName"));
  assert.ok(at > 0, "governanceScopeName exists");
  const body = shellLines.slice(at, at + 5).join("\n");
  assert.match(body, /_t\("Organization · \{scope\}"/);
  assert.doesNotMatch(body, /"Organization · "/);

  const scopeName = new Function(
    "_t",
    "scopeKind",
    "shortName",
    `${body}
return governanceScopeName;`,
  )(translate, (id: string) => (id.startsWith("org:") ? "org" : "channel"), (id: string) => id) as (
    id?: string,
  ) => string;

  setLocale("zh-CN");
  try {
    assert.equal(scopeName("org:acme"), "组织 · acme");
  } finally {
    setLocale("en");
  }
  assert.equal(scopeName("org:acme"), "Organization · acme");
  assert.equal(scopeName("channel:C1"), "channel:C1");
});

test("every dynamic label table in the shell resolves to a translated string", () => {
  const table = (name: string): string[] => {
    const at = shellLines.findIndex((line) => line.includes(`const ${name} = {`));
    if (at < 0) return [];
    let depth = 0;
    const values: string[] = [];
    for (let i = at; i < shellLines.length; i++) {
      for (const ch of shellLines[i]!) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      for (const m of shellLines[i]!.matchAll(/:\s*"([^"]+)"/g)) values.push(m[1]!);
      if (depth === 0 && i > at) break;
    }
    return values;
  };
  const keptAsBrand: Record<string, true> = { Slack: true, Web: true, QM: true };

  setLocale("zh-CN");
  try {
    for (const name of ["EFFECT_LABELS", "VIEW_TITLE", "KIND_LABEL"]) {
      for (const key of table(name)) {
        if (keptAsBrand[key]) continue;
        assert.notEqual(translate(key), key, `${name} key ${JSON.stringify(key)} has no zh-CN entry`);
      }
    }
  } finally {
    setLocale("en");
  }
});
