import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { cookie } from "../../chassis/src/http.ts";

function request(jar: string): IncomingMessage {
  return { headers: { cookie: jar } } as unknown as IncomingMessage;
}

test("a well-formed cookie value decodes", () => {
  assert.equal(cookie(request("qm_locale=zh-CN"), "qm_locale"), "zh-CN");
  assert.equal(cookie(request("qm_locale=zh%2DCN"), "qm_locale"), "zh-CN");
});

test("a cookie is found after an unrelated one", () => {
  assert.equal(cookie(request("admin=1; qm_locale=zh-CN; other=2"), "qm_locale"), "zh-CN");
});

test("a name that is a suffix of another cookie does not match", () => {
  assert.equal(cookie(request("xqm_locale=zh-CN"), "qm_locale"), null);
});

test("an absent or empty cookie yields null", () => {
  assert.equal(cookie({ headers: {} } as unknown as IncomingMessage, "qm_locale"), null);
  assert.equal(cookie(request("qm_locale="), "qm_locale"), null);
});

for (const malformed of ["%zz", "%", "%E0%A4%A", "%E0%A4%A%"]) {
  test(`a malformed percent-encoded value ${malformed} yields null instead of throwing`, () => {
    assert.equal(cookie(request(`qm_locale=${malformed}`), "qm_locale"), null);
  });
}

test("a cookie name holding regex metacharacters matches literally", () => {
  assert.equal(cookie(request("axc=2; a.c=1"), "a.c"), "1");
});