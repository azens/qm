import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_LOCALE,
  availableLocales,
  currentLocale,
  formatDate,
  formatNumber,
  formatRelativeTime,
  injectLocale,
  localeFromRequest,
  localeRevision,
  matchSupportedLocale,
  negotiateLocale,
  onLocaleChange,
  pluralize,
  setLocale,
  translate,
} from "../../chassis/src/i18n.ts";

const reset = (locale = "en"): void => {
  setLocale(locale);
};

test.afterEach(() => reset());

test("lookup hits the active catalog", () => {
  reset("zh-CN");
  assert.equal(translate("Language"), "语言");
  reset("en");
  assert.equal(translate("Language"), "Language");
});

test("a miss falls back to the en catalog, then to the key itself", () => {
  reset("zh-CN");
  assert.equal(translate("Definitely Not In Any Catalog"), "Definitely Not In Any Catalog");
  assert.equal(translate(""), "");
  assert.equal(translate("just now"), "刚刚");
});

test("translate never returns empty or undefined for a non-empty key", () => {
  reset("zh-CN");
  for (const key of ["Language", "{count} item", "nope", "Send"]) {
    const out = translate(key);
    assert.equal(typeof out, "string");
    assert.ok(out.length > 0, `${key} produced an empty string`);
  }
});

test("interpolation substitutes vars and leaves a missing placeholder in place", () => {
  assert.equal(translate("{count} items", { count: 3 }), "3 items");
  assert.equal(translate("{count} items"), "{count} items");
  assert.equal(translate("{count} items", { count: 0 }), "0 items");
  assert.equal(translate("{a} and {b}", { a: "x" }), "x and {b}");
});

test("negotiateLocale parses q-values and prefers the highest weight", () => {
  assert.equal(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8"), "zh-CN");
  assert.equal(negotiateLocale("en;q=0.2,zh-CN;q=0.9"), "zh-CN");
  assert.equal(negotiateLocale("fr;q=1.0,zh-CN;q=0.5"), "zh-CN");
});

test("negotiateLocale matches on prefix in both directions", () => {
  assert.equal(negotiateLocale("zh"), "zh-CN");
  assert.equal(negotiateLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(negotiateLocale("en-GB"), "en");
  assert.equal(matchSupportedLocale("zh_CN"), "zh-CN");
  assert.equal(matchSupportedLocale("de"), null);
});

test("negotiateLocale falls back to en for empty, absent and unusable input", () => {
  for (const input of [undefined, null, "", "   ", "*", "fr-FR", "zh-CN;q=0"]) {
    assert.equal(negotiateLocale(input as string | undefined), DEFAULT_LOCALE, `input: ${String(input)}`);
  }
});

test("setLocale normalizes an unsupported locale to the default and persists the choice", () => {
  const seen: number[] = [];
  const stop = onLocaleChange(() => seen.push(localeRevision()));
  setLocale("zh");
  assert.equal(currentLocale(), "zh-CN");
  setLocale("de");
  assert.equal(currentLocale(), "en");
  assert.ok(seen.length >= 2);
  stop();
});

test("locale revision only advances on a real change and drives unsubscription", () => {
  reset("en");
  const before = localeRevision();
  setLocale("en");
  assert.equal(localeRevision(), before);
  setLocale("zh-CN");
  assert.equal(localeRevision(), before + 1);

  let calls = 0;
  const stop = onLocaleChange(() => {
    calls += 1;
  });
  setLocale("en");
  assert.equal(calls, 1);
  stop();
  setLocale("zh-CN");
  assert.equal(calls, 1);
});

test("availableLocales lists en and zh-CN", () => {
  assert.deepEqual([...availableLocales()], ["en", "zh-CN"]);
});

test("formatNumber and formatDate are locale-sensitive", () => {
  assert.equal(formatNumber(1234567.5), "1,234,567.5");
  assert.equal(formatNumber(1234567.5, undefined, "zh-CN"), "1,234,567.5");
  assert.equal(formatDate(new Date(Date.UTC(2026, 0, 2)), { timeZone: "UTC", dateStyle: "medium" }), "Jan 2, 2026");
  assert.equal(
    formatDate(new Date(Date.UTC(2026, 0, 2)), { timeZone: "UTC", dateStyle: "medium" }, "zh-CN"),
    "2026年1月2日",
  );
  assert.equal(formatDate(new Date(Date.UTC(2026, 0, 2)), { timeZone: "UTC" }, "zh-CN"), "2026/1/2");
  assert.equal(formatDate("not a date"), "");
});

test("formatRelativeTime reads as English or Chinese per the active locale", () => {
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  const ago = (ms: number): number => now - ms;
  reset("en");
  assert.equal(formatRelativeTime(ago(0), now), "just now");
  assert.equal(formatRelativeTime(ago(3 * 60_000), now), "3m ago");
  assert.equal(formatRelativeTime(ago(5 * 3_600_000), now), "5h ago");
  assert.equal(formatRelativeTime(ago(2 * 86_400_000), now), "2d ago");
  assert.equal(formatRelativeTime(now + 3 * 60_000, now), "in 3m");
  reset("zh-CN");
  assert.equal(formatRelativeTime(ago(0), now), "刚刚");
  assert.equal(formatRelativeTime(ago(3 * 60_000), now), "3 分钟前");
  assert.equal(formatRelativeTime(ago(5 * 3_600_000), now), "5 小时前");
  assert.equal(formatRelativeTime(ago(2 * 86_400_000), now), "2 天前");
  assert.equal(formatRelativeTime(now + 3 * 60_000, now), "3 分钟后");
});

test("pluralize inflects English and leaves Chinese uninflected", () => {
  const forms = { one: "{count} item", other: "{count} items" };
  assert.equal(pluralize(1, forms, "en"), "1 item");
  assert.equal(pluralize(4, forms, "en"), "4 items");
  assert.equal(pluralize(1, forms, "zh-CN"), "1 items");
  assert.equal(pluralize(4, forms, "zh-CN"), "4 items");
  assert.equal(pluralize(3, { other: "{count} 个项目" }, "zh-CN"), "3 个项目");
});

test("the request cookie outranks Accept-Language, and a bad cookie falls through", () => {
  assert.equal(localeFromRequest("zh-CN", "en"), "zh-CN");
  assert.equal(localeFromRequest("de", "zh-CN,zh;q=0.9"), "zh-CN");
  assert.equal(localeFromRequest(null, "zh"), "zh-CN");
  assert.equal(localeFromRequest(null, undefined), "en");
});

test("injectLocale rewrites html lang and the boot meta, and is inert without a head", () => {
  const shell = '<!doctype html><html lang="en"><head><meta charset="UTF-8" /></head><body></body></html>';
  const injected = injectLocale(shell, "zh-CN");
  assert.match(injected, /<html lang="zh-CN">/);
  assert.match(injected, /<meta name="qm-locale" content="zh-CN" \/>/);

  const replaced = injectLocale(injected, "en");
  assert.match(replaced, /<html lang="en">/);
  assert.equal(replaced.match(/qm-locale/g)?.length, 1);

  assert.match(injectLocale('<html><head></head></html>', "zh"), /<html lang="zh-CN"/);
  assert.equal(injectLocale("<p>no shell</p>", "zh-CN"), "<p>no shell</p>");
  assert.match(injectLocale(shell, "de"), /<html lang="en">/);
});

test("the module imports and translates in a bare Node process with no DOM globals", () => {
  const entry = new URL("../../chassis/src/i18n.ts", import.meta.url).href;
  const script = `
    for (const name of ["document", "localStorage", "navigator", "window"]) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
    }
    const mod = await import(${JSON.stringify(entry)});
    process.stdout.write(JSON.stringify({
      locale: mod.currentLocale(),
      translated: mod.translate("Language"),
      negotiated: mod.negotiateLocale("zh-CN,zh;q=0.9"),
      locales: mod.availableLocales(),
      relative: mod.formatRelativeTime(Date.now() - 120000),
    }));
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
  assert.deepEqual(JSON.parse(out), {
    locale: "en",
    translated: "Language",
    negotiated: "zh-CN",
    locales: ["en", "zh-CN"],
    relative: "2m ago",
  });
});

test("the first currentLocale() resolves sync the document language, not just setLocale", () => {
  const entry = new URL("../../chassis/src/i18n.ts", import.meta.url).href;
  const script = `
    const dom = new (await import("jsdom")).JSDOM(
      '<!doctype html><html lang="en"><head><meta name="qm-locale" content="en"></head><body></body></html>',
      { url: "http://localhost/" },
    );
    const view = dom.window;
    view.localStorage.setItem("qm.locale", "zh-CN");
    let cookieWrites = 0;
    Object.defineProperty(view.document, "cookie", {
      get: () => "",
      set: () => { cookieWrites += 1; },
      configurable: true,
    });
    for (const name of ["document", "localStorage", "navigator", "window"]) {
      Object.defineProperty(globalThis, name, { value: view[name], configurable: true });
    }
    const mod = await import(${JSON.stringify(entry)});
    const locale = mod.currentLocale();
    process.stdout.write(JSON.stringify({
      locale,
      lang: view.document.documentElement.lang,
      cookieWrites,
    }));
  `;
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: new URL("../", import.meta.url).pathname.replace(/^\//, "").replace(/\/$/, ""),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
  assert.deepEqual(JSON.parse(out), {
    locale: "zh-CN",
    lang: "zh-CN",
    cookieWrites: 0,
  });
});
