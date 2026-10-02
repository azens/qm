import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { LocaleController, t } from "../../chassis/src/i18n-lit.ts";
import type * as I18n from "../../chassis/src/i18n.ts";
import { currentLocale, formatRelativeTime, setLocale } from "../../chassis/src/i18n.ts";
import { zhCNWebUiViews } from "../../chassis/src/locales/zh-CN.web-ui-views.ts";
import { zhCNWebUiMore } from "../../chassis/src/locales/zh-CN.web-ui-more.ts";
import { zhCNAdminUi } from "../../chassis/src/locales/zh-CN.admin-ui.ts";
import { zhCNAdminShell } from "../../chassis/src/locales/zh-CN.admin-shell.ts";
import { zhCNDisambiguation } from "../../chassis/src/locales/zh-CN.disambiguation.ts";

const UNKNOWN_KEY = "a string nobody ever translated 4711";

const SURFACES: Array<[string, Record<string, string>, string[]]> = [
  [
    "web-ui views",
    zhCNWebUiViews,
    ["Needs review", "Share conversation", "Load more", "What can I help with?", "Available to {who}"],
  ],
  [
    "web-ui more",
    zhCNWebUiMore,
    [
      "New cron",
      "Connect your apps",
      "Search file names and types…",
      "Ready to ship",
      "This project is ready for work",
      "Failed to load runs",
    ],
  ],
  ["admin ui modules", zhCNAdminUi, ["Badges & feedback", "Example model", "Display name", "Edit", "just now"]],
  ["admin shell", zhCNAdminShell, ["+ Add provider", "Sign out", "Try again", "+ Add scope ▾"]],
  [
    "disambiguation",
    zhCNDisambiguation,
    ["Admin console", "background runs", "{count} runs", "Destination view", "Organization · {scope}"],
  ],
];

let bootSeq = 0;

const freshModule = (): Promise<typeof I18n> =>
  import(`../../chassis/src/i18n.ts?end-to-end=${bootSeq++}`) as Promise<typeof I18n>;

function browserFixture(cookie?: string): Window & typeof globalThis {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', {
    url: "http://localhost/",
  });
  if (cookie) dom.window.document.cookie = cookie;
  const view = dom.window as unknown as Window & typeof globalThis;
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, { value: (view as never)[name], configurable: true, writable: true });
  }
  return view;
}

test.afterEach(() => {
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, { value: undefined, configurable: true, writable: true });
  }
  setLocale("en");
});

test("every merged surface renders Chinese under zh-CN and its English source under en", () => {
  for (const [surface, catalog, keys] of SURFACES) {
    for (const key of keys) {
      assert.ok(key in catalog, `${surface} must define ${JSON.stringify(key)}`);
      assert.notEqual(catalog[key], key, `${surface}: ${JSON.stringify(key)} must be translated`);
      setLocale("zh-CN");
      assert.equal(t(key), catalog[key], `${surface}: ${JSON.stringify(key)} under zh-CN`);
      setLocale("en");
      assert.equal(t(key), key, `${surface}: ${JSON.stringify(key)} under en`);
    }
  }
});

test("an unknown key returns the key verbatim under both locales", () => {
  setLocale("zh-CN");
  assert.equal(t(UNKNOWN_KEY), UNKNOWN_KEY);
  setLocale("en");
  assert.equal(t(UNKNOWN_KEY), UNKNOWN_KEY);
});

test("switching locale re-renders a template t() and a plain helper t() together", () => {
  browserFixture();
  setLocale("en");

  let updates = 0;
  const controller = new LocaleController({ requestUpdate: () => (updates += 1) });
  controller.hostConnected();

  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  const tip = (label: string): string => label;
  const relTime = (ms: number): string => formatRelativeTime(ms, now);

  const renderPass = (): { template: string; helperViaTip: string; helperViaRelTime: string } => ({
    template: t("{count} items", { count: 2 }),
    helperViaTip: tip(t("Retry")),
    helperViaRelTime: relTime(Date.UTC(2026, 0, 2, 11, 57, 0)),
  });

  const english = renderPass();
  assert.equal(english.template, "2 items");
  assert.equal(english.helperViaTip, "Retry");
  assert.equal(english.helperViaRelTime, "3m ago");

  setLocale("zh-CN");
  assert.equal(updates, 1, "the host is asked to re-render exactly once per switch");

  const chinese = renderPass();
  assert.equal(chinese.template, "2 个项目");
  assert.equal(chinese.helperViaTip, "重试", "a helper calling t() re-reads the locale too");
  assert.equal(chinese.helperViaRelTime, "3 分钟前", "a helper calling formatRelativeTime follows the locale");

  setLocale("en");
  assert.equal(updates, 2);
  assert.deepEqual(renderPass(), english, "switching back restores the English render exactly");
  controller.hostDisconnected();
});

test("the selected locale persists in the cookie and is restored on a fresh module load", async () => {
  const view = browserFixture();
  setLocale("zh-CN");

  assert.match(view.document.cookie, /qm_locale=zh-CN/, "the choice is written to the cookie");
  assert.equal(currentLocale(), "zh-CN");

  const restored = await freshModule();

  assert.equal(restored.currentLocale(), "zh-CN", "a fresh module load honours the cookie");
  assert.equal(restored.translate("Needs review"), zhCNWebUiViews["Needs review"]);
  assert.equal(restored.translate(UNKNOWN_KEY), UNKNOWN_KEY, "the unknown-key contract survives a reload");
});

test("a cookie written by an earlier visit is honoured when no module state exists", async () => {
  browserFixture("qm_locale=zh-CN");
  const fresh = await freshModule();

  assert.equal(fresh.currentLocale(), "zh-CN");
  assert.equal(fresh.translate("New cron"), zhCNWebUiMore["New cron"]);
});