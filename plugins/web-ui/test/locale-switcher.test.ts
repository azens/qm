import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createLocaleSwitcher } from "../../chassis/src/locale-switcher.ts";
import { currentLocale, setLocale } from "../../chassis/src/i18n.ts";

function fixture(): { document: Document; window: Window & typeof globalThis } {
  const dom = new JSDOM("<!doctype html><html lang='en'><head></head><body></body></html>", { url: "http://localhost/" });
  const view = dom.window as unknown as Window & typeof globalThis;
  for (const name of ["document", "localStorage", "navigator", "window"] as const) {
    Object.defineProperty(globalThis, name, { value: view[name], configurable: true, writable: true });
  }
  return { document: view.document, window: view };
}

test.afterEach(() => setLocale("en"));

test("the switcher offers one option per supported locale, labelled in its own script", () => {
  const { document: doc } = fixture();
  setLocale("en");
  const { element, dispose } = createLocaleSwitcher(doc);
  const options = [...element.querySelectorAll("option")];
  assert.deepEqual(
    options.map((o) => o.value),
    ["en", "zh-CN"],
  );
  assert.deepEqual(
    options.map((o) => o.textContent),
    ["English", "简体中文"],
  );
  assert.deepEqual(
    options.map((o) => o.getAttribute("lang")),
    ["en", "zh-CN"],
    "each option declares its own lang for screen readers",
  );
  dispose();
});

test("the switcher is keyboard reachable and labelled", () => {
  const { document: doc } = fixture();
  const { element, dispose } = createLocaleSwitcher(doc);
  assert.equal(element.tagName, "SELECT");
  assert.equal(element.getAttribute("aria-label"), "Language");
  assert.equal(element.tabIndex, 0, "a native select is in the tab order without extra wiring");
  doc.body.append(element);
  element.focus();
  assert.equal(doc.activeElement, element);
  dispose();
});

test("choosing an option persists the locale and re-labels the control", () => {
  const { document: doc, window: view } = fixture();
  setLocale("en");
  const { element, dispose } = createLocaleSwitcher(doc);
  assert.equal(element.value, "en");

  element.value = "zh-CN";
  element.dispatchEvent(new view.Event("change"));
  assert.equal(currentLocale(), "zh-CN");
  assert.equal(element.getAttribute("aria-label"), "语言");
  dispose();
});

test("the control follows an external locale change", () => {
  const { document: doc } = fixture();
  setLocale("en");
  const { element, dispose } = createLocaleSwitcher(doc);
  setLocale("zh-CN");
  assert.equal(element.value, "zh-CN");
  dispose();
});

test("dispose detaches the listener and removes the element from the document", () => {
  const { document: doc } = fixture();
  setLocale("en");
  const { element, dispose } = createLocaleSwitcher(doc);
  doc.body.append(element);
  assert.equal(element.isConnected, true);
  dispose();
  assert.equal(element.isConnected, false);
  setLocale("zh-CN");
  assert.equal(element.getAttribute("aria-label"), "Language", "no listener fires after dispose");
});
