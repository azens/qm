import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessions = readFileSync(new URL("../src/sessions.ts", import.meta.url), "utf8");

function block(marker: string): string {
  const at = sessions.indexOf(marker);
  assert.ok(at >= 0, `missing marker: ${marker}`);
  return sessions.slice(at, sessions.indexOf("</button>", at));
}

test("the sidebar row's archive button names itself on hover", () => {
  const archive = block('class="session-menu-btn session-archive-btn"');
  assert.match(archive, /\$\{tip\(s\.archived \? t\("Unarchive"\) : t\("Archive"\)\)\}/);
  assert.match(archive, /aria-label=/);
});

test("the sidebar row's options button names itself on hover", () => {
  const options = block("data-menu-id=${s.id}");
  assert.match(options, /\$\{tip\(t\("Chat options"\)\)\}/);
  assert.match(options, /aria-label=/);
});

test("row tooltips reuse the wording the chats page already uses for the same actions", () => {
  const chatsPage = block('${tip(s.archived ? t("Unarchive") : t("Archive"))}');
  assert.ok(chatsPage.length > 0);
  assert.equal(sessions.match(/\$\{tip\(s\.archived \? t\("Unarchive"\) : t\("Archive"\)\)\}/g)?.length, 2);
  assert.doesNotMatch(sessions, /CHAT_OPTIONS_TOOLTIP/);
});

test("every sidebar control uses the app tooltip, never the native title attribute", () => {
  assert.doesNotMatch(sessions, /\n\s*title="/);
  assert.doesNotMatch(sessions, /\n\s*title=\$\{/);
});
