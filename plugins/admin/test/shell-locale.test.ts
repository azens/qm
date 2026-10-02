import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

const core = createServer((req: IncomingMessage, res) => {
  if ((req.url ?? "").startsWith("/v1/surface-config")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ branding: { accent: "#f0652f", selfLabel: "QM" } }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});
await new Promise<void>((r) => core.listen(0, r));

process.env.CORE_API_URL = `http://localhost:${(core.address() as AddressInfo).port}`;
process.env.CORE_ORG_ID = "acme";
process.env.CORE_SIGNING_SECRET = "shell-locale-test-secret";
process.env.INBOX_USERS = "U-admin";

const { server } = await import("../src/index.ts");
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

test.after(() => {
  server.close();
  core.close();
});

const shellFor = async (headers: Record<string, string>): Promise<string> => {
  const res = await fetch(`${base}/`, { headers });
  assert.equal(res.status, 200);
  return res.text();
};

test("Accept-Language alone drives the shell's lang and the client boot hint", async () => {
  const zh = await shellFor({ "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" });
  assert.match(zh, /<html lang="zh-CN">/);
  assert.match(zh, /<meta name="qm-locale" content="zh-CN" \/>/);
  assert.doesNotMatch(zh, /<html lang="en">/);

  const en = await shellFor({ "accept-language": "en-US,en;q=0.9" });
  assert.match(en, /<html lang="en">/);
  assert.match(en, /<meta name="qm-locale" content="en" \/>/);
});

test("the qm_locale cookie outranks Accept-Language", async () => {
  const html = await shellFor({ "accept-language": "en-US,en;q=0.9", cookie: "qm_locale=zh-CN" });
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<meta name="qm-locale" content="zh-CN" \/>/);
});

test("a missing Accept-Language still yields a valid shell rather than a crash", async () => {
  const html = await shellFor({});
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="qm-locale" content="en" \/>/);
});

test("the shell cache is keyed on locale, so alternating languages each get their own shell", async () => {
  const first = await shellFor({ cookie: "qm_locale=zh-CN" });
  const english = await shellFor({ cookie: "qm_locale=en" });
  const chineseAgain = await shellFor({ cookie: "qm_locale=zh-CN" });

  assert.match(first, /<html lang="zh-CN">/);
  assert.match(english, /<html lang="en">/);
  assert.equal(chineseAgain, first, "the zh-CN shell is served from cache, not rebuilt into English");
});

test("the etag differs per locale so a cached shell is never served for the other language", async () => {
  const etagFor = async (locale: string): Promise<string> => {
    const res = await fetch(`${base}/`, { headers: { cookie: `qm_locale=${locale}` } });
    return res.headers.get("etag") ?? "";
  };
  const zh = await etagFor("zh-CN");
  const en = await etagFor("en");
  assert.ok(zh.length > 0);
  assert.notEqual(zh, en);
});

test("an explicit If-None-Match revalidates against the locale that was asked for", async () => {
  const first = await fetch(`${base}/`, { headers: { cookie: "qm_locale=zh-CN" } });
  const etag = first.headers.get("etag") ?? "";
  const revalidated = await fetch(`${base}/`, { headers: { cookie: "qm_locale=zh-CN", "if-none-match": etag } });
  assert.equal(revalidated.status, 304);

  const otherLocale = await fetch(`${base}/`, { headers: { cookie: "qm_locale=en", "if-none-match": etag } });
  assert.equal(otherLocale.status, 200, "the English shell is not served from the Chinese etag");
  assert.match(await otherLocale.text(), /<html lang="en">/);
});

test("branding still drives the shell and survives the locale injection", async () => {
  const html = await shellFor({ cookie: "qm_locale=zh-CN" });
  assert.match(html, /--brand-accent:#f0652f/);
  assert.match(html, /<title>QM Admin<\/title>/);
});
