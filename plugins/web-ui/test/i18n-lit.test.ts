import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { LocaleController, t } from "../../chassis/src/i18n-lit.ts";
import { currentLocale, formatRelativeTime, setLocale } from "../../chassis/src/i18n.ts";

function browserFixture(): { window: Window & typeof globalThis; document: Document } {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', {
    url: "http://localhost/",
  });
  const view = dom.window as unknown as Window & typeof globalThis;
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, { value: (view as never)[name], configurable: true, writable: true });
  }
  return { window: view, document: view.document };
}

test.afterEach(() => {
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, { value: undefined, configurable: true, writable: true });
  }
  setLocale("en");
});

test("t is the translate function, usable for text nodes and attribute values", () => {
  setLocale("zh-CN");
  assert.equal(t("Language"), "语言");
  assert.equal(t("{count} items", { count: 2 }), "2 个项目");
});

test("every catalog fragment contributes Chinese strings that translate() actually resolves", () => {
  setLocale("zh-CN");
  assert.equal(currentLocale(), "zh-CN");
  assert.equal(t("just now"), "刚刚", "the base catalog");
  assert.equal(t("(no action)"), "（无操作）", "the web-ui-core fragment");
  assert.equal(t("+ Add provider"), "+ 添加服务商", "the admin-shell fragment");
  assert.equal(t("← Memory"), "← 记忆", "the admin-ui fragment");
  for (const key of ["just now", "(no action)", "+ Add provider", "← Memory"]) {
    assert.notEqual(t(key), key, `${key} must not fall through untranslated`);
  }
});

test("the English fallback chain survives the merged catalog", () => {
  setLocale("zh-CN");
  assert.equal(t("a key nobody translated 42"), "a key nobody translated 42");
  assert.equal(t(""), "");
  setLocale("en");
  assert.equal(t("← Memory"), "← Memory", "en stays a full catalog, not a sparse stub");
  assert.equal(t("a key nobody translated 42"), "a key nobody translated 42");
});

test("the controller subscribes on connect and unsubscribes on disconnect", () => {
  setLocale("en");
  let updates = 0;
  const controller = new LocaleController({ requestUpdate: () => (updates += 1) });

  controller.hostConnected();
  setLocale("zh-CN");
  assert.equal(updates, 1);
  setLocale("en");
  assert.equal(updates, 2);

  controller.hostDisconnected();
  setLocale("zh-CN");
  assert.equal(updates, 2);
});

test("hostConnected twice does not double-subscribe", () => {
  setLocale("en");
  let updates = 0;
  const controller = new LocaleController({ requestUpdate: () => (updates += 1) });
  controller.hostConnected();
  controller.hostConnected();
  setLocale("zh-CN");
  assert.equal(updates, 1);
  controller.hostDisconnected();
});

test("the controller is inert before connect and safe to re-connect after disconnect", () => {
  setLocale("en");
  let updates = 0;
  const controller = new LocaleController({ requestUpdate: () => (updates += 1) });
  setLocale("zh-CN");
  assert.equal(updates, 0);
  controller.hostConnected();
  setLocale("en");
  assert.equal(updates, 1);
  controller.hostDisconnected();
  controller.hostConnected();
  setLocale("zh-CN");
  assert.equal(updates, 2);
});

test("a helper called outside a template re-reads the locale on the same revision as template t()", () => {
  browserFixture();
  setLocale("en");

  let updates = 0;
  const controller = new LocaleController({ requestUpdate: () => (updates += 1) });
  controller.hostConnected();

  const relTime = (ms: number): string => formatRelativeTime(ms, Date.UTC(2026, 0, 2, 12, 0, 0));
  const renderPass = (): { template: string; helper: string } => ({
    template: t("{count} items", { count: 2 }),
    helper: relTime(Date.UTC(2026, 0, 2, 11, 57, 0)),
  });

  const english = renderPass();
  assert.equal(english.template, "2 items");
  assert.equal(english.helper, "3m ago");

  setLocale("zh-CN");
  assert.equal(updates, 1, "the directive/directive-style host is asked to re-render");

  const chinese = renderPass();
  assert.equal(chinese.template, "2 个项目");
  assert.equal(chinese.helper, "3 分钟前");
  controller.hostDisconnected();
});

let bootSeq = 0;

async function bootLocale(dom: { document: Document; navigator: { language: string } }): Promise<string> {
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    const value = name === "document" ? dom.document : name === "navigator" ? dom.navigator : undefined;
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  const fresh = (await import(
    `../../chassis/src/i18n.ts?boot=${bootSeq++}`
  )) as typeof import("../../chassis/src/i18n.ts");
  return fresh.currentLocale();
}

test("boot resolves cookie first, then the server hint, then navigator, then en", async () => {
  const shell = (head: string): Document =>
    new JSDOM(`<!doctype html><html lang="en"><head>${head}</head><body></body></html>`, {
      url: "http://localhost/",
    }).window.document;

  assert.equal(await bootLocale({ document: shell(""), navigator: { language: "en-US" } }), "en");

  const cookied = shell("");
  cookied.cookie = "qm_locale=en";
  assert.equal(
    await bootLocale({ document: cookied, navigator: { language: "zh-CN" } }),
    "en",
    "the cookie outranks both the server hint and navigator.language",
  );

  assert.equal(
    await bootLocale({
      document: shell('<meta name="qm-locale" content="zh-CN" />'),
      navigator: { language: "en-US" },
    }),
    "zh-CN",
    "the server hint outranks navigator.language",
  );

  assert.equal(
    await bootLocale({ document: shell(""), navigator: { language: "zh-CN" } }),
    "zh-CN",
    "navigator.language is the last resort before en",
  );

  assert.equal(
    await bootLocale({ document: shell(""), navigator: { language: "fr-FR" } }),
    "en",
    "an unsupported navigator language lands on en",
  );

  assert.equal(
    await bootLocale({ document: shell('<meta name="qm-locale" content="de" />'), navigator: { language: "en-US" } }),
    "en",
    "an unsupported server hint is ignored rather than trusted",
  );
});

test("a process with no document never adopts the host machine's language", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN" }, configurable: true });
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true, writable: true });
  try {
    const fresh = (await import(
      `../../chassis/src/i18n.ts?headless=${bootSeq++}`
    )) as typeof import("../../chassis/src/i18n.ts");
    assert.equal(fresh.currentLocale(), "en", "server-side rendering is driven by the request, not the host OS");
  } finally {
    Object.defineProperty(globalThis, "document", { value: undefined, configurable: true, writable: true });
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
  }
});

test("setLocale reflects the choice onto the document element language", () => {
  const { document: doc } = browserFixture();
  setLocale("zh-CN");
  assert.equal(doc.documentElement.lang, "zh-CN");
  setLocale("en");
  assert.equal(doc.documentElement.lang, "en");
});
