import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { t } from "../../chassis/src/i18n-lit.ts";
import { setLocale } from "../../chassis/src/i18n.ts";
import { workedLabel } from "../src/work-duration.ts";
import { goalElapsedLabel, goalWorkedLabel } from "../src/goal-strip.ts";
import { COMPOSIO_UNAVAILABLE_CODES, composioUnavailableMessage } from "../src/composio-errors.ts";

const splitSource = readFileSync(new URL("../src/split.ts", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../../admin/public/index.html", import.meta.url), "utf8");

test.afterEach(() => setLocale("en"));

function browserFixture(existing?: DOMWindow): void {
  const dom = existing
    ? null
    : new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', { url: "http://localhost/" });
  const view = (existing ?? dom!.window) as unknown as Window & typeof globalThis;
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, {
      value: (view as never)[name],
      configurable: true,
      writable: true,
    });
  }
}

test("the pane tool table holds translation keys, never an unevaluated t(...) string", () => {
  const table = splitSource.slice(
    splitSource.indexOf("function paneTools("),
    splitSource.indexOf("function openPaneTool"),
  );
  assert.match(table, /label: t\("Crons"\)/);
  for (const key of ["Crons", "Apps", "Files", "Skills", "Memory", "Your keychain"]) {
    assert.match(table, new RegExp(`label: t\\("${key}"\\)`), `${key} must be a real t() call`);
  }
  assert.doesNotMatch(table, /label: "t\(/, "a literal t(...) string renders verbatim in the toolbar");
});

test("the pane tool toolbar renders Chinese labels and no stray closing tag", () => {
  browserFixture();
  setLocale("zh-CN");
  const labels = ["Crons", "Apps", "Files", "Skills", "Memory", "Your keychain"].map((key) => t(key));
  for (const label of labels) {
    assert.doesNotMatch(label, /^[A-Za-z]/, `${label} must not still be English`);
    assert.doesNotMatch(label, /t\(/, "the literal t(...) string regressed");
  }
  assert.deepEqual(labels, ["定时任务", "应用", "文件", "技能", "记忆", "你的密钥链"]);

  const toolbar = splitSource.slice(splitSource.indexOf("class GroupActions"), splitSource.indexOf("function notePaneSession"));
  assert.doesNotMatch(toolbar, /<\/>/, "a stray </> swallows the rest of the menu markup");
});

test("the session action buttons carry localized tooltips and aria-labels", () => {
  browserFixture();
  setLocale("zh-CN");
  assert.equal(t("Share conversation"), "分享对话");
  assert.equal(t("Archive session"), "归档会话");
  const actions = splitSource.slice(
    splitSource.indexOf("function sessionActionItems"),
    splitSource.indexOf("function sessionActions"),
  );
  assert.match(actions, /label: t\("Share conversation"\)/);
  assert.match(actions, /label: t\("Archive session"\)/);
  assert.doesNotMatch(actions, /label: "Share conversation"/);
  assert.doesNotMatch(actions, /label: "Archive session"/);
  const rendered = splitSource.slice(
    splitSource.indexOf("function sessionActions"),
    splitSource.indexOf("let tabMenu"),
  );
  assert.match(rendered, /aria-label=\$\{a\.aria \?\? a\.label\}/, "aria-label follows the translated label");
});

test("an elapsed work label is fully Chinese, with no English connector or unit left", () => {
  browserFixture();
  setLocale("zh-CN");
  const label = workedLabel(t("Worked"), 47);
  assert.equal(label, "已处理（47 秒）");
  assert.doesNotMatch(label, /[A-Za-z]{2}/, `half-translated label: ${label}`);

  assert.equal(workedLabel(t("Worked"), 0), "已处理");
  assert.equal(goalElapsedLabel(0, 3_000), "3 秒");
  assert.equal(goalElapsedLabel(0, 90_000), "1 分钟 30 秒");
  assert.equal(goalElapsedLabel(0, 3_600_000), "1 小时");
  assert.equal(goalElapsedLabel(0, 3_900_000), "1 小时 5 分钟");
  assert.equal(goalWorkedLabel(720_000, "20 分钟"), "已投入 12 分钟 · 下限 20 分钟");
});

test("the English work label keeps its connector so the two locales read alike", () => {
  browserFixture();
  setLocale("en");
  assert.equal(workedLabel(t("Worked"), 47), "Worked for 47s");
  assert.equal(goalElapsedLabel(0, 90_000), "1m 30s");
});

test("the Slack settings card is fully Chinese, including its accessible name", () => {
  browserFixture();
  setLocale("zh-CN");
  const card = readFileSync(new URL("../src/slack-account.ts", import.meta.url), "utf8");
  for (const key of [
    "Your Slack account",
    "Your Slack account is linked",
    "Link your Slack account",
    "Linking Slack…",
    "Let QM search Slack and take action on your behalf.",
    "Check connection",
    "Could not verify your Slack account.",
    "Could not verify your Slack account. Try again.",
  ]) {
    assert.match(card, new RegExp(`t\\("${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\)`), `${key} must go through t()`);
    assert.notEqual(t(key), key, `${key} needs a zh-CN entry`);
  }
  assert.equal(t("Your Slack account"), "你的 Slack 账号");
  assert.equal(t("Link your Slack account"), "关联你的 Slack 账号");
});

test("the apps retry copy and the composio refusal render Chinese", () => {
  browserFixture();
  setLocale("zh-CN");
  const welcome = readFileSync(new URL("../src/onboarding-welcome.ts", import.meta.url), "utf8");
  assert.match(welcome, /\$\{t\("Connect your apps"\)\}/);
  assert.match(welcome, /\$\{t\("Try again"\)\}/);
  assert.doesNotMatch(welcome, />Try again</);

  assert.equal(
    composioUnavailableMessage({ unavailable_code: "composio_not_enabled" }),
    "你的账号暂不支持应用连接。请联系管理员开通。",
  );
  assert.equal(composioUnavailableMessage({ unavailable_code: "composio_upstream_failed" }), "无法加载应用。请重试。");
  assert.equal(composioUnavailableMessage({}), null, "an uncoded refusal falls back to the caller's own copy");
  assert.equal(composioUnavailableMessage({ unavailable_code: "composio_retired_code" }), null);

  assert.doesNotMatch(welcome, /t\(result\.message\)/, "server prose must never be used as a translation key");
});

test("the composio refusal copy is keyed by the server code, not the server sentence", () => {
  const composioRoute = readFileSync(new URL("../../../src/api/routes/composio.ts", import.meta.url), "utf8");
  for (const code of COMPOSIO_UNAVAILABLE_CODES) {
    assert.match(composioRoute, new RegExp(`"${code}"`), `${code} is never emitted by the composio route`);
    assert.doesNotMatch(
      composioRoute,
      /error: "composio_unavailable",\s*message:/,
      "a bare composio_unavailable response carries no code, so the client cannot pick copy",
    );
  }
  const mapper = readFileSync(new URL("../src/composio-errors.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mapper, /payload\.message/, "the client must key off unavailable_code, never the server sentence");
});

const REAL_STATIC_MARKUP = extractFunction("function translateStaticMarkup", "\n      }");

function extractFunction(header: string, closer: string): string {
  const start = adminHtml.indexOf(header);
  assert.notEqual(start, -1, `${header} not found in the admin shell`);
  const end = adminHtml.indexOf(closer, start);
  assert.notEqual(end, -1, `the end of ${header} not found in the admin shell`);
  return adminHtml.slice(start, end + closer.length);
}

function mountStaticTranslator(view: DOMWindow, translate: (key: string) => string): () => void {
  const run = new view.Function(
    "_t",
    "I18N_TEXT_ATTRS",
    "Node",
    `${REAL_STATIC_MARKUP}\nreturn translateStaticMarkup;`,
  );
  const translateStaticMarkup = run(
    translate,
    ["aria-label", "title", "placeholder"],
    view.Node,
  ) as (root?: ParentNode) => void;
  return () => translateStaticMarkup(view.document);
}

test("translateStaticMarkup leaves child controls alone so the locale listener can register", () => {
  const body = adminHtml.slice(
    adminHtml.indexOf('<label for="policy-sample"'),
    adminHtml.indexOf('id="policy-sample"'),
  );
  assert.match(body, />Command<input/, "the label keeps a translatable text node beside its input");

  const dom = new JSDOM(
    `<!doctype html><html><body><label data-i18n="Command">Command<input id="policy-sample"></label>` +
      `<span data-i18n="Share conversation">Share conversation</span></body></html>`,
    { url: "http://localhost/" },
  );
  browserFixture(dom.window);
  setLocale("zh-CN");
  const repaint = mountStaticTranslator(dom.window, t);
  repaint();
  const { document } = dom.window;
  assert.equal(document.querySelector("label")!.textContent, "命令");
  assert.ok(
    document.getElementById("policy-sample"),
    "wiping textContent destroys the input, and the load-time crash skips onLocaleChange(repaintLocale)",
  );
  assert.equal(document.querySelector("span")!.textContent, "分享对话");
});

test("a locale repaint never overwrites text the runtime owns", () => {
  const view = adminHtml.slice(
    adminHtml.indexOf('<div id="view-governance">'),
    adminHtml.indexOf('<div class="governance-layout">'),
  );
  assert.ok(view.includes('id="governance-status-model"'), "the governance view slice lost its status tiles");
  const dom = new JSDOM(`<!doctype html><html><body>${view}</body></html>`, { url: "http://localhost/" });
  const root = dom.window.document;
  const tiles = [...root.querySelectorAll(".governance-status")];
  assert.equal(tiles.length, 5, "the governance overview must still declare its five status tiles");

  browserFixture(dom.window);
  setLocale("zh-CN");
  const repaint = mountStaticTranslator(dom.window, t);
  const runtimeOwned = ["隔离", "开放", "默认", "继承", "继承"];
  tiles.forEach((tile, index) => {
    assert.equal(tile.querySelector(".v")!.hasAttribute("data-i18n"), false, `.v tile ${index} is marked translatable`);
    assert.equal(
      tile.querySelector(".detail")!.hasAttribute("data-i18n"),
      false,
      `.detail tile ${index} is marked translatable`,
    );
    tile.querySelector(".v")!.textContent = runtimeOwned[index]!;
    tile.querySelector(".detail")!.textContent = `详情${index}`;
  });
  for (const id of ["governance-loading", "environment-notice-open"]) {
    assert.equal(root.getElementById(id)!.hasAttribute("data-i18n"), false, `#${id} is marked translatable`);
  }
  const loading = root.getElementById("governance-loading")!;
  loading.textContent = "你没有管理此范围的权限。";

  repaint();

  tiles.forEach((tile, index) => {
    assert.equal(tile.querySelector(".v")!.textContent, runtimeOwned[index], `tile ${index} reset to its loading copy`);
    assert.equal(tile.querySelector(".detail")!.textContent, `详情${index}`, `tile ${index} detail was reset`);
  });
  assert.equal(loading.textContent, "你没有管理此范围的权限。", "the error banner reset to its loading copy");
});

test("the admin repaints through elements that actually exist", () => {
  const repaint = adminHtml.slice(adminHtml.indexOf("function repaintLocale"), adminHtml.indexOf("onLocaleChange(repaintLocale)"));
  assert.doesNotMatch(repaint, /\$\("home-label"\)/, "#home-label does not exist, so the repaint throws");
  assert.match(adminHtml, /<a class="header-home" href="\/" id="home-link">/);
  assert.match(repaint, /\$\("home-link"\)\.querySelector\("span"\)/);
  assert.match(repaint, /connectorTipText\(\)/, "connectorTip is null until the governance view mounts");
  assert.match(repaint, /translateStaticMarkup\(\);/);
  assert.match(adminHtml, /governanceUI\.onLocaleChange\(repaintLocale\);/);
});
