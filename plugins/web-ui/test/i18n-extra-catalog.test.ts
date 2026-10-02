import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setLocale, translate } from "../../chassis/src/i18n.ts";
import { zhCN } from "../../chassis/src/locales/zh-CN.ts";

test.afterEach(() => setLocale("en"));

const read = (name: string): string => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

const SOURCES: Record<string, string> = {
  "sent-mail.ts": read("sent-mail.ts"),
  "loop-icon.ts": read("loop-icon.ts"),
  "theme-import.ts": read("theme-import.ts"),
  "assistant-sidebar.ts": read("assistant-sidebar.ts"),
  "split.ts": read("split.ts"),
  "session-scope.ts": read("session-scope.ts"),
  "core-bridge.ts": read("core-bridge.ts"),
  "memory.ts": read("memory.ts"),
  "mermaid-block.ts": read("mermaid-block.ts"),
  "shared-session.ts": read("shared-session.ts"),
  "slack-account.ts": read("slack-account.ts"),
  "slack-setup.ts": read("slack-setup.ts"),
  "onboarding-slack.ts": read("onboarding-slack.ts"),
  "onboarding-welcome.ts": read("onboarding-welcome.ts"),
  "deploy-permissions.ts": read("deploy-permissions.ts"),
  "deploy-view.ts": read("deploy-view.ts"),
  "files.ts": read("files.ts"),
  "session-list.ts": read("session-list.ts"),
  "channel-header.ts": read("channel-header.ts"),
  "connection-picker.ts": read("connection-picker.ts"),
  "connector-widget.ts": read("connector-widget.ts"),
  "calendar.ts": read("calendar.ts"),
  "browse.ts": read("browse.ts"),
  "fork-origin.ts": read("fork-origin.ts"),
  "suggested-activities.ts": read("suggested-activities.ts"),
  "ambient-policy.ts": read("ambient-policy.ts"),
  "context-model.ts": read("context-model.ts"),
  "timeline.ts": read("timeline.ts"),
  "inbox-chat.ts": read("inbox-chat.ts"),
  "ui.ts": read("ui.ts"),
  "search.ts": read("search.ts"),
};

const KEYS_BY_FILE: Record<string, string[]> = {
  "sent-mail.ts": [
    "Ask about this email",
    "Loading chat…",
    "Loading sent mail…",
    "Loading email…",
    "No sent emails in this account.",
    "Open sent email: {subject}",
    "No subject",
    "Undisclosed recipients",
    "(No subject)",
    "To: {recipients}",
    "· Cc: {recipients}",
    "Attachments: {names}",
    "This email has no text body.",
    "Couldn't load chat.",
  ],
  "loop-icon.ts": [
    "Choose an image smaller than 2 MB.",
    "Choose a PNG, JPEG, WebP, GIF, or SVG image.",
    "This image has no visible size.",
    "Image uploads are unavailable in this browser.",
    "This image is too complex. Choose a simpler image.",
  ],
  "theme-import.ts": [
    "Imported theme",
    "This is a binary plist. In iTerm2, export the preset again to the XML .itermcolors file.",
    "Expected an iTerm2 .itermcolors file with a Background Color and a Foreground Color.",
    "Couldn't read that file. Expected an iTerm2 .itermcolors or a VS Code color theme .json.",
    "Expected a VS Code color theme object.",
    "Expected a VS Code color theme with an editor.background color.",
  ],
  "assistant-sidebar.ts": [
    "Summarize my inbox",
    "Summarize my recent emails",
    "Summarize this email",
    "Summarize this thread",
    "Make it shorter",
    "Remove the salutations",
    "Send the draft with your instructions",
    "Send it",
    "Conversation",
  ],
  "split.ts": [
    "Already open in a pane",
    "Split left",
    "Split right",
    "Split up",
    "Split down",
    "Show here",
    "Replace pane",
    "Open as tab",
    "Split this pane with a new session",
    "Open full screen",
    "Tools",
  ],
  "session-scope.ts": ["Back to this chat", "Session tools", "This conversation's workspace"],
  "core-bridge.ts": [
    "Shared channel",
    "No active run to signal.",
    "Approve or deny the pending command to continue.",
    "The credential request is still pending. Please try again.",
    "Could not continue after the approval.",
    "Could not queue the message.",
    "Could not send the approval.",
    "Could not request stop. Try again.",
    "Nothing to send.",
    "Message wasn’t sent. Check your connection and try again.",
    "Timed out waiting for the agent to respond.",
  ],
  "memory.ts": [
    "History",
    "Forget this fact",
    "No remembered facts match this search.",
    "The agent hasn’t noted any facts yet.",
  ],
  "mermaid-block.ts": [
    "Diagram is too large",
    "Images are not supported in chat diagrams",
    "Diagram dimensions are too large",
    "Rendering diagram…",
    "Diagram will render when the reply finishes.",
    "Unable to render this diagram. Its source is shown below.",
    "Mermaid diagram. Diagram source is available below.",
  ],
  "shared-session.ts": [
    "Shared conversation",
    "This link is unavailable",
    "The conversation is unavailable or you may not have access.",
    "Organization only",
    "Shared snapshot · {date} · {audience}",
  ],
  "slack-account.ts": [
    "Slack authorization was cancelled. Your QM account has not been linked.",
    "Could not start Slack authorization. Please try again.",
    "Could not verify the Slack authorization link.",
    "Could not connect Slack.",
  ],
  "slack-setup.ts": [
    "Create token",
    "Submit token securely",
    "App created. No more token copying needed.",
    "Paste it only in the secure form, never in this conversation. QM uses it to create its app, then discards it.",
    "This token can manage other apps you own in the selected workspace. Your company owns the app QM creates.",
    "Check progress",
  ],
  "onboarding-slack.ts": [
    "Could not check the Slack installation. Try again.",
    "Could not open your browser. Please try again.",
    "Allow a new tab to install QM, then try again.",
    "Connecting Slack",
    "Opening Slack…",
    "Checking Slack…",
    "QM added to Slack",
    "Work with QM where your team already talks.",
    "Check again",
  ],
  "onboarding-welcome.ts": [
    "And welcome to QM, the agent harness we use to run YC.",
    "Use it to research customers and investors, fundraise, and automate the everyday work of running {company}",
    "More ideas",
    "Think of it as your YC partner in a box. The more you use QM, the more context we have, the more we can help.",
    "Welcome to QM, your agent harness. Use it to research customers, build tools, and automate the everyday work of running {company}",
    "The easiest way to get up and running:",
    "Opening {name}…",
  ],
  "deploy-permissions.ts": [
    "Can view",
    "Can manage",
    "Remove access",
    "Cancel selection",
    "Add",
    "Add people",
    "Add {email} with view access",
    "They receive an app link by email and sign in with this address. This does not add them to your organization.",
    "People with access",
    "General access",
    "Restricted",
  ],
  "deploy-view.ts": ["No apps shared with you.", "Nothing archived.", "No apps of your own yet.", "Unknown owner"],
  "files.ts": [
    "Drop files",
    "Uploading…",
    "All files",
    "All types",
    "Images",
    "Documents",
    "Other",
  ],
  "session-list.ts": ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"],
  "channel-header.ts": [
    "Header pinned in the channel.",
    "Pinned header removed.",
    "Pinned header",
    "A small pinned message in the Slack channel naming the model in use.",
    "Pinned Slack header for this channel",
    "Default ({state})",
    "Couldn't update the pinned header setting.",
  ],
  "connection-picker.ts": [
    "Connect your apps",
    "Search apps",
    "Search apps…",
    "{count} app found",
    "{count} apps found",
    "Popular apps",
    "No apps match “{query}”. Try another name.",
    "Show fewer apps",
    "Browse all {count} apps",
  ],
  "connector-widget.ts": [
    "your account",
    "Connected {name}",
    "Ready to use in chat",
    "Opens in a new tab",
    "Authorize access · New tab",
  ],
  "calendar.ts": ["Calendar", "Coming soon."],
  "browse.ts": ["Org settings, people, and policy"],
  "fork-origin.ts": ["You no longer have access to the original conversation.", "Forked from"],
  "suggested-activities.ts": ["Suggested activities"],
  "ambient-policy.ts": [
    "Plain-language guidance for proactive work. Leave empty to respond only when addressed.",
    "For example: Flag anything that could delay the launch.",
  ],
  "context-model.ts": ["(no longer offered)"],
  "timeline.ts": ["Subagent"],
  "inbox-chat.ts": ["Inbox", "Inbox assistant"],
  "ui.ts": ["Loading", "Agent is working"],
  "search.ts": ["Go to"],
};

test("every residual user-facing string has a zh-CN entry", () => {
  setLocale("zh-CN");
  const missing: string[] = [];
  for (const [file, keys] of Object.entries(KEYS_BY_FILE)) {
    for (const key of keys) if (translate(key) === key) missing.push(`${file}: ${key}`);
  }
  assert.deepEqual(missing, [], "these strings render as English under zh-CN");
});

test("every residual user-facing string is translated to Chinese, not an identity mapping", () => {
  setLocale("zh-CN");
  const untranslated: string[] = [];
  for (const keys of Object.values(KEYS_BY_FILE)) {
    for (const key of keys) {
      const value = translate(key);
      if (!/[㐀-鿿]/.test(value)) untranslated.push(`${key} -> ${value}`);
    }
  }
  assert.deepEqual(untranslated, [], "identity or non-Chinese mappings reach the user untranslated");
});

test("each residual string is wired to a t() call in its own file", () => {
  const unwired: string[] = [];
  for (const [file, keys] of Object.entries(KEYS_BY_FILE)) {
    const src = SOURCES[file];
    for (const key of keys) {
      const direct = src.includes(`t("${key}")`) || src.includes(`t('${key}')`);
      const viaVariable = src.includes(`"${key}"`) || src.includes(`'${key}'`);
      if (!direct && !viaVariable) unwired.push(`${file}: ${key}`);
      if (!/i18n-lit/.test(src)) unwired.push(`${file}: no t() import`);
    }
  }
  assert.deepEqual([...new Set(unwired)], [], "a residual string is not wired into this file's t() path");
});

test("placeholder interpolation survives on the multi-line residual strings", () => {
  setLocale("zh-CN");
  assert.equal(
    translate("Forked from"),
    "派生自",
    "the fork-origin badge label is translated while the title stays in its own bdi",
  );
  assert.equal(
    translate("No apps match “{query}”. Try another name.", { query: "Notion" }),
    "没有匹配“Notion”的应用。换个名字试试。",
  );
  assert.equal(
    translate("Shared snapshot · {date} · {audience}", { date: "2026-10-02", audience: "仅限组织内" }),
    "共享快照 · 2026-10-02 · 仅限组织内",
  );
});

test("residual terminology matches the catalog the earlier waves already shipped", () => {
  setLocale("zh-CN");
  for (const [key, expected] of [
    ["No apps of your own yet.", "你还没有自己的应用。"],
    ["No apps shared with you.", "没有共享给你的应用。"],
    ["Session tools", "会话工具"],
    ["Back to this chat", "回到这段对话"],
    ["Forget this fact", "忘掉这条事实"],
    ["Shared conversation", "共享对话"],
  ] as const) {
    assert.equal(translate(key), expected, `${key} must reuse the established wording`);
  }
});

test("removing any single catalog entry leaves a detectable gap", () => {
  const render = (catalog: Record<string, string>, key: string): string => catalog[key] ?? key;
  for (const key of Object.values(KEYS_BY_FILE).flat()) {
    assert.notEqual(zhCN[key], undefined, `${key} has no zh-CN entry`);
    const withoutEntry = { ...zhCN };
    delete withoutEntry[key];
    assert.notEqual(
      render(withoutEntry, key),
      render(zhCN, key),
      `${key}: dropping the entry must fall back to English so the gap is observable`,
    );
  }
});