import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
const bundle = buildSync({
  entryPoints: [fileURLToPath(new URL("../ui/settings.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "settingsUI",
  platform: "browser",
}).outputFiles[0]!.text;
function setup() {
  const dom = new JSDOM(readFileSync(new URL("../public/index.html", import.meta.url), "utf8"), {
    runScripts: "outside-only",
  });
  dom.window.structuredClone = structuredClone;
  dom.window.eval(bundle + "; window.settingsUI=settingsUI;");
  return dom;
}
function slots(dom: JSDOM): Element[] {
  return [...dom.window.document.querySelectorAll("#view-governance .governance-content #qm-locale-slot")];
}

test("mounting the cards twice keeps a single language switcher", () => {
  const dom = setup();
  try {
    dom.window.eval("settingsUI.mountCards(); settingsUI.mountCards();");
    assert.equal(slots(dom).length, 1);
  } finally {
    dom.window.close();
  }
});

test("the language switcher returns after its host subtree is rebuilt", () => {
  const dom = setup();
  try {
    dom.window.eval("settingsUI.mountCards();");
    assert.equal(slots(dom).length, 1);
    dom.window.eval(`
      const view = document.getElementById("view-governance");
      const rebuilt = document.createElement("div");
      rebuilt.className = "governance-content";
      view.replaceChildren(rebuilt);
    `);
    assert.equal(slots(dom).length, 0);
    dom.window.eval("settingsUI.mountCards();");
    assert.equal(slots(dom).length, 1);
  } finally {
    dom.window.close();
  }
});

test("the rebuilt language switcher still drives the locale", () => {
  const dom = setup();
  try {
    dom.window.eval("settingsUI.mountCards();");
    dom.window.eval(`
      const view = document.getElementById("view-governance");
      const rebuilt = document.createElement("div");
      rebuilt.className = "governance-content";
      view.replaceChildren(rebuilt);
      settingsUI.mountCards();
    `);
    const select = dom.window.document.querySelector("#qm-locale-switcher") as HTMLSelectElement;
    assert.ok(select, "a language switcher is mounted after the rebuild");
    assert.ok(select.options.length > 1, "the switcher lists the available locales");
    assert.equal(dom.window.document.querySelectorAll("#qm-locale-switcher").length, 1);
  } finally {
    dom.window.close();
  }
});
