import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { adminScriptHash } from "../src/csp.ts";

const SOURCE_HTML = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const LF_HTML = SOURCE_HTML.replace(/\r\n?/g, "\n");
const CRLF_HTML = LF_HTML.replace(/\n/g, "\r\n");

function browserScriptHash(html: string): string {
  const script = new JSDOM(html).window.document.querySelector("script:not([src])");
  assert.ok(script, "document contains an inline script");
  return createHash("sha256")
    .update(script.textContent ?? "")
    .digest("base64");
}

test("the CSP hash ignores the line endings of the checked-out file", () => {
  assert.equal(adminScriptHash(CRLF_HTML), adminScriptHash(LF_HTML));
});

test("the CSP hash equals the browser's hash for a CRLF document", () => {
  assert.equal(adminScriptHash(CRLF_HTML), browserScriptHash(CRLF_HTML));
});

test("the CSP hash equals the browser's hash for an LF document", () => {
  assert.equal(adminScriptHash(LF_HTML), browserScriptHash(LF_HTML));
});

test("the CSP hash covers a script tag carrying attributes", () => {
  const html = '<html><body><script type="module">var a=1;</script></body></html>';
  assert.equal(adminScriptHash(html), browserScriptHash(html));
});

test("the CSP hash covers script text containing an escaped script end tag", () => {
  const html = "<html><body><script>'<!--<script>evil()</script>-->var a=1;'</script></body></html>";
  assert.equal(adminScriptHash(html), browserScriptHash(html));
});

test("the CSP hash ignores an externally sourced script", () => {
  const html = '<html><body><script src="/x.js"></script><script>var a=1;</script></body></html>';
  assert.equal(adminScriptHash(html), browserScriptHash(html));
});

test("a document with no inline script fails loudly instead of hashing an empty string", () => {
  assert.throws(() => adminScriptHash("<html><body><p>no script</p></body></html>"), /exactly one inline script/);
});

test("a document with two inline scripts fails loudly instead of hashing only the first", () => {
  assert.throws(
    () => adminScriptHash("<html><body><script>a()</script><script>b()</script></body></html>"),
    /exactly one inline script/,
  );
});

const core = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});
await new Promise<void>((r) => core.listen(0, r));
process.env.CORE_API_URL = `http://localhost:${(core.address() as AddressInfo).port}`;
process.env.CORE_SIGNING_SECRET = "admin-csp-test-secret";

const { server } = await import("../src/index.ts");
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as AddressInfo).port;

test.after(() => {
  server.close();
  if (core.listening) core.close();
});

test("the served CSP hash matches the browser's hash of the served document", async () => {
  const { promise, resolve, reject } = Promise.withResolvers<{ csp: string; body: string }>();
  const req = httpRequest({ host: "localhost", port, path: "/", method: "GET" }, (res) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () =>
      resolve({ csp: String(res.headers["content-security-policy"]), body: Buffer.concat(chunks).toString("utf8") }),
    );
  });
  req.on("error", reject);
  req.end();
  const { csp, body } = await promise;
  const declared = /script-src 'sha256-([^']+)'/.exec(csp)?.[1];
  assert.ok(declared, "server declares a script-src hash");
  assert.equal(declared, browserScriptHash(body));
});

test("the served CSP declares no unsafe source for scripts", async () => {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const req = httpRequest({ host: "localhost", port, path: "/", method: "GET" }, (res) => {
    res.resume();
    res.on("end", () => resolve(String(res.headers["content-security-policy"])));
  });
  req.on("error", reject);
  req.end();
  const csp = await promise;
  const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? "";
  assert.match(scriptSrc, /^'sha256-[A-Za-z0-9+/=]+'$/);
  assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval/);
  assert.equal(
    csp,
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
});