import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

const core = createServer((req: IncomingMessage, res) => {
  if ((req.url ?? "").startsWith("/v1/surface-config")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ branding: { accent: "#f0652f", mark: "Y", selfLabel: "QM" } }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end("{}");
});
await new Promise<void>((r) => core.listen(0, r));

process.env.CORE_API_URL = `http://localhost:${(core.address() as AddressInfo).port}`;
process.env.CORE_SIGNING_SECRET = "web-ui-shell-locale-test";
process.env.WEB_UI_PRINCIPALS = "alice";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist-web");
const distIndex = join(distDir, "index.html");
const viteTemplate = readFileSync(new URL("../index.html", import.meta.url), "utf8");
if (!existsSync(distIndex) || !readFileSync(distIndex, "utf8").includes("<html lang=")) {
  mkdirSync(distDir, { recursive: true });
  writeFileSync(distIndex, viteTemplate);
}

const { handler } = await import("../server/index.ts");
const surface = createServer((req, res) => void handler(req, res));
await new Promise<void>((r) => surface.listen(0, r));
const base = `http://localhost:${(surface.address() as AddressInfo).port}`;

test.after(() => {
  surface.close();
  core.close();
});

const shellFor = async (headers: Record<string, string>): Promise<string> => {
  const res = await fetch(`${base}/`, { headers: { cookie: "webuiuser=alice", ...headers } });
  assert.equal(res.status, 200);
  return res.text();
};

test("the served shell replaces the template's hardcoded lang with the negotiated locale", async () => {
  const zh = await shellFor({ "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" });
  assert.match(zh, /<html lang="zh-CN">/);
  assert.match(zh, /<meta name="qm-locale" content="zh-CN" \/>/);
  assert.doesNotMatch(zh, /<html lang="en">/);
});

test("the qm_locale cookie wins over Accept-Language", async () => {
  const html = await shellFor({ "accept-language": "en-US,en;q=0.9", cookie: "webuiuser=alice; qm_locale=zh-CN" });
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<meta name="qm-locale" content="zh-CN" \/>/);
});

test("no Accept-Language and no cookie still serve a valid en shell", async () => {
  const html = await shellFor({});
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="qm-locale" content="en" \/>/);
});

test("alternating locales each get their own shell, proving the hint is not cached across languages", async () => {
  const first = await shellFor({ cookie: "webuiuser=alice; qm_locale=zh-CN" });
  const english = await shellFor({ cookie: "webuiuser=alice; qm_locale=en" });
  const chineseAgain = await shellFor({ cookie: "webuiuser=alice; qm_locale=zh-CN" });
  assert.match(first, /<html lang="zh-CN">/);
  assert.match(english, /<html lang="en">/);
  assert.equal(chineseAgain, first);
});

test("the locale injection does not disturb branding", async () => {
  const html = await shellFor({ cookie: "webuiuser=alice; qm_locale=zh-CN" });
  assert.match(html, /--brand-accent:#f0652f/);
  assert.match(html, /<meta name="brand-self-label" content="QM"/);
});

test("the vite template ships the anchors the server rewrites", () => {
  assert.match(viteTemplate, /<html lang="en">/, "the template still needs a lang attribute to rewrite");
  assert.match(viteTemplate, /<head>/, "the meta is injected before </head>");
});
