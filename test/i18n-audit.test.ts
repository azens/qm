import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  classifySource,
  collectCallSiteKeys,
  collectCallSites,
  collectTranslatedTableKeys,
  isFragmentKey,
  isIdentityMapping,
  isTechnicalText,
  placeholderMismatch,
  runCatalogAudit,
} from "../scripts/i18n-audit.mjs";
import type { I18nBucket } from "../scripts/i18n-audit.mjs";
import { IDENTITY_EXEMPT } from "../plugins/chassis/src/locales/identity-exempt.ts";
import { zhCN } from "../plugins/chassis/src/locales/zh-CN.ts";

function buckets(code: string, opts?: { html?: boolean }): I18nBucket[] {
  return classifySource(code, { file: "x.ts", ...opts })
    .findings.filter((f) => f.bucket !== "NON_UI")
    .map((f) => f.bucket);
}

function uiTexts(code: string, opts?: { html?: boolean }): string[] {
  return classifySource(code, { file: "x.ts", ...opts })
    .findings.filter((f) => f.bucket === "UI_STRING")
    .map((f) => f.text);
}

test("user-facing literals are reported as untranslated UI strings", () => {
  assert.deepEqual(buckets(`const label = "Settings";`), ["UI_STRING"]);
  assert.deepEqual(buckets(`render(html\`<button>Save changes</button>\`);`), ["UI_STRING"]);
  assert.deepEqual(buckets(`render(html\`<input placeholder="Enter a name" />\`);`), ["UI_STRING"]);
  assert.deepEqual(buckets(`render(html\`<span aria-label="Close dialog"></span>\`);`), ["UI_STRING"]);
  assert.deepEqual(buckets(`plural(count, "error");`), ["UI_STRING"]);
  assert.deepEqual(buckets(`toast("Could not save your changes.");`), ["UI_STRING"]);
  assert.deepEqual(buckets(`statusEl.textContent = "All systems go";`), ["UI_STRING"]);
});

test("machine strings and log lines are not reported", () => {
  assert.deepEqual(buckets(`const url = "/v1/turns";`), []);
  assert.deepEqual(buckets(`console.log("connection reset by peer");`), []);
  assert.deepEqual(buckets(`const s = status === "err" ? "dirty" : "saving";`), []);
  assert.deepEqual(buckets(`mode = "compact";`), []);
  assert.deepEqual(buckets(`import { thing } from "./thing.ts";`), []);
  assert.deepEqual(buckets(`switch (kind) { case "user": break; }`), []);
  assert.deepEqual(buckets(`if (evt.key === "Enter") send();`), []);
  assert.deepEqual(buckets(`el.setAttribute("data-state", "pending");`), []);
  assert.deepEqual(buckets(`type Kind = "open" | "closed";`), []);
  assert.deepEqual(buckets(`fetch(url, { method: "POST" });`), []);
});

test("strings already passed to a translation call are counted as translated", () => {
  assert.deepEqual(buckets(`render(t("Settings"));`), ["ALREADY_TRANSLATED"]);
  assert.deepEqual(buckets(`render(translate("Settings"));`), ["ALREADY_TRANSLATED"]);
  assert.deepEqual(buckets(`render(i18n.t("Settings"));`), ["ALREADY_TRANSLATED"]);
  assert.deepEqual(buckets(`render(html\`<button>\${t("Save")}</button>\`);`), ["ALREADY_TRANSLATED"]);
  assert.deepEqual(buckets(`render(html\`<button>\${s.t("Save")}</button>\`);`), ["ALREADY_TRANSLATED"]);
});

test("an untranslated sibling of a translated call is still an offender", () => {
  const found = buckets(`html\`<p>\${t("Welcome")} to Settings</p>\`;`).slice().sort();
  assert.deepEqual(found, ["ALREADY_TRANSLATED", "UI_STRING"]);
});

test("CSS text nodes inside a style block are ignored", () => {
  const html = `<style>\n.btn::after { content: "Copy to clipboard"; font: 12px "Segoe UI"; }\n</style>\n<button>Copy</button>`;
  assert.deepEqual(uiTexts(html, { html: true }), ["Copy"]);
});

test("markup text, aria-label and script literals in HTML are separated", () => {
  const html = `<h1>Admin is temporarily unavailable</h1>
<button aria-label="Retry now">Try again</button>
<script>
  console.log("boot sequence finished");
  el.textContent = "Still loading your data";
</script>`;
  assert.deepEqual(uiTexts(html, { html: true }), [
    "Admin is temporarily unavailable",
    "Retry now",
    "Try again",
    "Still loading your data",
  ]);
});

test("line numbers point at the offending string", () => {
  const src = `const a = 1;\nconst b = 2;\nconst label = "Settings";\n`;
  const [finding] = classifySource(src, { file: "x.ts" }).findings;
  assert.equal(finding?.line, 3);
  assert.equal(finding?.text, "Settings");
});

test("per-file counts add up to the file's findings", () => {
  const src = `const a = "Settings";\nconst b = t("Errors");\nconst c = console.log("noise");\n`;
  const result = classifySource(src, { file: "x.ts" });
  assert.equal(result.counts.UI_STRING, 1);
  assert.equal(result.counts.ALREADY_TRANSLATED, 1);
  assert.equal(result.counts.NON_UI, 1);
  const summed = Object.values(result.counts).reduce((a, b) => a + b, 0);
  assert.equal(summed, result.findings.length);
});

test("technical-text heuristic rejects identifiers but accepts prose", () => {
  assert.equal(isTechnicalText("/v1/turns"), true);
  assert.equal(isTechnicalText("err"), true);
  assert.equal(isTechnicalText("no-such-key"), true);
  assert.equal(isTechnicalText("2024-01-01"), true);
  assert.equal(isTechnicalText("settings-panel"), true);
  assert.equal(isTechnicalText("Save"), false);
  assert.equal(isTechnicalText("No errors recorded for this scope."), false);
});

test("label tables that flow into t() have every value treated as a translation key", () => {
  const sources = [
    {
      file: "icons.ts",
      src: `export const LOOP_ICONS = [
  { id: "repeat", label: "Loop" },
  { id: "zap", label: "Lightning" },
];
export function render() { return html\`\${LOOP_ICONS.map((choice) => t(choice.label))}\`; }`,
    },
  ];
  const tables = collectTranslatedTableKeys(sources);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]?.name, "LOOP_ICONS");
  assert.deepEqual([...(tables[0]?.values ?? [])].sort(), ["Lightning", "Loop"]);
});

test("a table that never reaches t() is not treated as a translation source", () => {
  const sources = [
    {
      file: "provider.ts",
      src: `const PROVIDER_LABELS = { openai: "OpenAI" };
export function label(key: string) { return PROVIDER_LABELS[key] ?? key; }`,
    },
  ];
  assert.deepEqual(collectTranslatedTableKeys(sources), []);
});

test("a same-named table in another file does not make an unused declaration count as translated", () => {
  const sources = [
    { file: "icons.ts", src: `export const LOOP_ICONS = [{ id: "zap", label: "Lightning" }];` },
    { file: "other.ts", src: `const LOOP_ICONS = [{ id: "zap", label: "Lightning" }]; render(t(LOOP_ICONS[0].label));` },
  ];
  const tables = collectTranslatedTableKeys(sources);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]?.file, "other.ts");
});

test("an exported table counts as translated when an importing file feeds it to t()", () => {
  const sources = [
    { file: "icons.ts", src: `export const LOOP_ICONS = [{ id: "zap", label: "Lightning" }];` },
    { file: "loops.ts", src: `import { LOOP_ICONS } from "./icons";\nrender(LOOP_ICONS.map((choice) => t(choice.label)));` },
  ];
  const tables = collectTranslatedTableKeys(sources);
  assert.equal(tables.length, 1);
  assert.equal(tables[0]?.file, "icons.ts");
  assert.deepEqual([...(tables[0]?.values ?? [])], ["Lightning"]);
});

test("catalog misses reported for the known LOOP_ICONS labels", () => {
  for (const label of ["Loop", "Lightning", "Bug", "Shield", "Chart", "Check", "Book", "Rocket", "Globe", "Heart", "Wrench"]) {
    assert.notEqual(zhCN[label], undefined, `${label} must have a zh-CN entry`);
  }
  for (const label of ["Group", "expired", "Gmail Pub/Sub"]) {
    assert.notEqual(zhCN[label], undefined, `${label} must have a zh-CN entry`);
  }
  assert.deepEqual(collectCallSiteKeys(`t("cron");`), new Set(["cron"]));
  assert.deepEqual(collectCallSiteKeys(`t(LOOP_ICONS[0].label);`), new Set());
});

test("a key chosen by a ternary is collected so a missing branch cannot hide", () => {
  assert.deepEqual([...collectCallSiteKeys(`render(t(ok ? "Yes" : "No"));`)].sort(), ["No", "Yes"]);
  assert.deepEqual([...collectCallSiteKeys(`render(t(a ? "One" : b ? "Two" : "Three"));`)].sort(), ["One", "Three", "Two"]);
});

test("a key bound to a module constant is collected through the binding", () => {
  const src = 'export const PENDING_APPROVAL_REASON = "Approve or deny the pending command to continue.";\nrender(t(PENDING_APPROVAL_REASON));';
  assert.deepEqual([...collectCallSiteKeys(src)], ["Approve or deny the pending command to continue."]);
  const aliased = 'const BASE = "Save changes";\nconst LABEL = BASE;\nrender(t(LABEL));';
  assert.deepEqual([...collectCallSiteKeys(aliased)], ["Save changes"]);
  const member = 'const LABELS = { draft: "Draft state" };\nrender(t(LABELS.draft));';
  assert.deepEqual([...collectCallSiteKeys(member)], ["Draft state"]);
});

test("a key imported from another module resolves through the import", async () => {
  const root = mkdtempSync(join(tmpdir(), "qm-i18n-import-"));
  try {
    const dir = join(root, "plugins/web-ui/src");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "labels.ts"),
      'export const IMPORTED_REASON = "A shared key with no catalog entry";\n',
    );
    writeFileSync(
      join(dir, "bridge.ts"),
      'import { IMPORTED_REASON } from "./labels.ts";\nrender(t(IMPORTED_REASON));\n',
    );
    const catalog = await runCatalogAudit(root);
    assert.deepEqual(
      catalog.misses,
      [{ file: "plugins/web-ui/src/bridge.ts", key: "A shared key with no catalog entry" }],
      "a key bound in another module and imported here must still reach the catalog check",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a key that cannot be resolved is counted as dynamic instead of guessed", () => {
  const interpolated = collectCallSites("render(t(`Hello ${name}`));");
  assert.deepEqual([...interpolated.keys], []);
  assert.equal(interpolated.dynamic.length, 1);
  assert.deepEqual(collectCallSites("render(t(row.label));").dynamic.length, 1);
  assert.deepEqual(
    collectCallSites("const label = `${row.name} · ${row.size}`;\nrender(t(label));").keys,
    new Set(),
  );
  assert.deepEqual(collectCallSites("render(t(a ? \"One\" : row.label));").dynamic.length, 1);
});

test("adjacent string literals concatenate into the key they produce", () => {
  assert.deepEqual([...collectCallSiteKeys(`render(t("Save" + " now"));`)], ["Save now"]);
  assert.deepEqual(collectCallSites('render(t("Save " + row.name));').dynamic.length, 1);
});

test("a dynamic key with no catalog entry is reported as a catalog miss", async () => {
  const root = mkdtempSync(join(tmpdir(), "qm-i18n-audit-"));
  try {
    const dir = join(root, "plugins/web-ui/src");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "widget.ts"),
      'const REASON = "A dynamic key with no catalog entry";\nconst MODE = { draft: "A dynamic member with no entry" };\nrender(t(REASON));\nrender(t(MODE.draft));\nrender(t(flag ? "A dynamic branch with no entry" : "Another dynamic branch with no entry"));\n',
    );
    const catalog = await runCatalogAudit(root);
    assert.deepEqual(
      catalog.misses.map((miss) => miss.key).sort(),
      [
        "A dynamic branch with no entry",
        "A dynamic key with no catalog entry",
        "A dynamic member with no entry",
        "Another dynamic branch with no entry",
      ],
      "a key reached only through a binding or a branch must still be checked against the catalog",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an identity mapping is reported unless it is explicitly exempt", () => {
  assert.equal(isIdentityMapping("Webhook", "Webhook", {}), true);
  assert.equal(isIdentityMapping("Webhook", "Webhook", { Webhook: "protocol" }), false);
  assert.equal(isIdentityMapping("Save", "保存", {}), false);
  assert.equal(isIdentityMapping("{value} KB", "{value} KB", {}), true);
});

test("every exempt identity key is still an identity mapping in the catalog", () => {
  for (const key of Object.keys(IDENTITY_EXEMPT)) {
    assert.equal(zhCN[key], key, `exempt key ${JSON.stringify(key)} must map to itself`);
  }
  const offenders = Object.keys(zhCN).filter((key) => isIdentityMapping(key, zhCN[key] ?? "", IDENTITY_EXEMPT));
  assert.deepEqual(offenders, []);
});

test("placeholder sets must match between key and translation", () => {
  assert.equal(placeholderMismatch("{count} items", "{count} 个项目"), null);
  assert.deepEqual(placeholderMismatch("{count} items", "项目"), { missing: ["count"], extra: [] });
  assert.deepEqual(placeholderMismatch("Saved", "已保存 {count}"), { missing: [], extra: ["count"] });
});

test("the shipped catalog has no placeholder mismatch", () => {
  const mismatched = Object.keys(zhCN).filter((key) => placeholderMismatch(key, zhCN[key] ?? ""));
  assert.deepEqual(mismatched, []);
});

test("fragment keys are rejected when they carry words", () => {
  assert.equal(isFragmentKey("Show "), true);
  assert.equal(isFragmentKey("Failed: "), true);
  assert.equal(isFragmentKey("Save changes"), false);
  assert.equal(isFragmentKey(", "), false);
});

test("the shipped catalog has no word-bearing fragment keys", () => {
  const fragments = Object.keys(zhCN).filter((key) => isFragmentKey(key));
  assert.deepEqual(fragments, []);
});
