import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { setLocale, translate } from "../../chassis/src/i18n.ts";
import { zhCNDisambiguation } from "../../chassis/src/locales/zh-CN.disambiguation.ts";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");
const shell = read("../public/index.html");
const adminUi = ["artifacts.ts", "activity.ts", "users.ts", "keychain.ts"]
  .map((name) => read(`../ui/${name}`))
  .join("\n");
const webUi = ["settings.ts", "shell.ts", "chat.ts", "contexts.ts"]
  .map((name) => read(`../../web-ui/src/${name}`))
  .join("\n");

const SHELL_PATH = "admin/public/index.html";
const SHELL_SOURCE = "../public/index.html";
const SOURCE_ROOTS: { dir: string; prefix: string }[] = [
  { dir: "../../web-ui/src", prefix: "web-ui/src" },
  { dir: "../ui", prefix: "admin/ui" },
  { dir: "../../web-ui/server", prefix: "web-ui/server" },
  { dir: "../../../src", prefix: "src" },
];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(new URL(`${dir}/`, import.meta.url), { withFileTypes: true })) {
    const next = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(next, acc);
    else if (/\.(ts|html)$/.test(entry.name)) acc.push(next);
  }
  return acc;
}

const ALL_SOURCES: { path: string; text: string }[] = [
  ...SOURCE_ROOTS.flatMap(({ dir, prefix }) => sourceFiles(dir).map((path) => ({ path: `${prefix}/${path.slice(dir.length + 1)}`, text: read(path) }))),
  { path: SHELL_PATH, text: read(SHELL_SOURCE) },
];

const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function referenceSites(key: string): string[] {
  const composed = /^\{count\} (.+)$/.exec(key);
  const noun = composed?.[1]?.replace(/s$/, "");
  const matchers = [
    new RegExp(
      `(?:^|[^\\w$])(?:t|_t|translate|governanceUI\\.t)\\(\\s*(?:"${escapeRe(key)}"|'${escapeRe(key)}')`,
    ),
    new RegExp(`data-i18n="${escapeRe(key)}"`),
    ...(noun
      ? [new RegExp(`(?:plural|count)\\([\\s\\S]{0,200}?"${escapeRe(noun)}"`)]
      : []),
  ];
  return ALL_SOURCES.filter((source) => matchers.some((matcher) => matcher.test(source.text))).map(
    (source) => source.path,
  );
}

const INDIRECT_ANCHORS: Record<string, { at: string; anchor: RegExp }> = {
  "Search…": { at: SHELL_PATH, anchor: /searchField\(\{[^}]*placeholder = "Search…"/ },
  judgments: { at: SHELL_PATH, anchor: /view === "judgments" \? "judgments"/ },
  "background runs": { at: SHELL_PATH, anchor: /active\.label === "Background" \? "background runs"/ },
  Background: { at: "admin/ui/spend-chart.ts", anchor: /\["background", "Background"\]/ },
  Created: { at: "web-ui/src/activity-presentation.ts", anchor: /ok: "Created"/ },
  "Needs attention": { at: "admin/ui/design.ts", anchor: /\["--warn", "Needs attention"\]/ },
  Started: { at: "web-ui/src/activity-presentation.ts", anchor: /ok: "Started"/ },
};

const RENAMED: { key: string; english: string; zh: string; at: string[] }[] = [
  {
    key: "Admin console",
    english: "Admin console",
    zh: "管理控制台",
    at: [shell, webUi],
  },
  {
    key: "Administrator",
    english: "Administrator",
    zh: "管理员",
    at: [adminUi],
  },
  { key: "Open app", english: "Open app", zh: "打开应用", at: [webUi] },
  { key: "Open session", english: "Open session", zh: "打开会话", at: [webUi] },
  { key: "Open file", english: "Open file", zh: "打开文件", at: [webUi] },
  { key: "Destination view", english: "Destination view", zh: "目标页面", at: [shell] },
  { key: "Credential list", english: "Credential list", zh: "凭据列表", at: [adminUi] },
  { key: "Credential settings", english: "Credential settings", zh: "凭据设置", at: [shell] },
  { key: "New users", english: "New users", zh: "新增用户", at: [adminUi] },
  {
    key: "Theme setting System",
    english: "Theme setting System",
    zh: "跟随系统",
    at: [webUi],
  },
  {
    key: "Organization · {scope}",
    english: "Organization · {scope}",
    zh: "组织 · {scope}",
    at: [shell],
  },
  {
    key: "Allow external Slack audiences?",
    english: "Allow external Slack audiences?",
    zh: "允许外部 Slack 参与者吗？",
    at: [shell],
  },
  { key: "Search…", english: "Search…", zh: "搜索…", at: [shell] },
  { key: "judgments", english: "judgments", zh: "判断记录", at: [shell] },
  { key: "background runs", english: "background runs", zh: "后台运行", at: [shell] },
];

test("every disambiguated key resolves to its intended English text under the en locale", () => {
  setLocale("en");
  for (const { key, english } of RENAMED) {
    assert.equal(translate(key), english, `en output for ${JSON.stringify(key)} changed`);
  }
});

test("every disambiguated key renders Chinese under the zh-CN locale", () => {
  setLocale("zh-CN");
  for (const { key, zh } of RENAMED) {
    assert.notEqual(translate(key), key, `${JSON.stringify(key)} has no zh-CN entry`);
    if (key.includes("{")) continue;
    assert.equal(translate(key), zh, `zh-CN output for ${JSON.stringify(key)}`);
  }
  assert.equal(translate("Organization · {scope}", { scope: "acme" }), "组织 · acme");
  assert.equal(translate("{count} error", { count: 7 }), "7 个错误");
  assert.equal(translate("{count} errors", { count: 7 }), "7 个错误");
});

test("every plural noun the admin surfaces compose has a zh-CN entry", () => {
  const sources = [
    shell,
    ...["activity.ts", "artifacts.ts", "history.ts", "metrics.ts", "user-detail.ts"].map((name) =>
      read(`../ui/${name}`),
    ),
  ];
  const composed = new Set<string>();
  for (const source of sources) {
    for (const m of source.matchAll(/(?:^|[^.\w])plural\([^,()]+,\s*"([^"]+)"/g)) {
      composed.add(`{count} ${m[1]!}`);
      composed.add(`{count} ${m[1]!}s`);
    }
    for (const m of source.matchAll(/\bcount\([^,()]+,\s*"([^"]+)",\s*"([^"]+)"/g)) {
      composed.add(m[1]!);
      composed.add(m[2]!);
    }
  }
  assert.ok(composed.size > 20, `expected the composed-noun scan to find keys, found ${composed.size}`);

  setLocale("zh-CN");
  for (const key of composed) {
    assert.notEqual(translate(key, { count: 3 }), key, `composed key ${JSON.stringify(key)} has no zh-CN entry`);
    assert.ok(
      /[㐀-鿿]/.test(translate(key, { count: 3 })),
      `composed key ${JSON.stringify(key)} renders no Chinese`,
    );
  }

  setLocale("en");
  for (const key of composed) {
    assert.match(translate(key, { count: 3 }), /^3 /, `en output for ${JSON.stringify(key)} changed`);
  }
});

test("the fragment supplies a translation for every key it declares", () => {
  setLocale("zh-CN");
  for (const [key, value] of Object.entries(zhCNDisambiguation)) {
    assert.ok(value.trim().length > 0, `${key} has an empty translation`);
    assert.ok(/[㐀-鿿]/.test(value), `${key} translation ${JSON.stringify(value)} has no Chinese`);
  }
  setLocale("en");
});

const DECLARED_REFERENCES: Record<string, string[]> = {
  "Admin console": ["admin/public/index.html", "web-ui/src/settings.ts", "web-ui/src/shell.ts"],
  Administrator: ["admin/ui/activity.ts", "admin/ui/users.ts"],
  "Open app": ["web-ui/src/chat.ts", "web-ui/src/deploys.ts"],
  "Open session": ["web-ui/src/chat.ts", "web-ui/src/webhooks.ts"],
  "Open file": ["web-ui/src/contexts.ts"],
  "Destination view": ["admin/public/index.html"],
  "Credential list": ["admin/ui/keychain.ts"],
  "Credential settings": ["admin/public/index.html"],
  "New users": ["admin/ui/artifacts.ts"],
  "Theme setting System": ["web-ui/src/settings.ts"],
  "Organization · {scope}": ["admin/public/index.html"],
  "Allow external Slack audiences?": ["admin/public/index.html"],
  "{count} error": ["admin/ui/activity.ts", "admin/ui/history.ts", "admin/ui/transcript.ts"],
  "{count} errors": ["admin/ui/activity.ts", "admin/ui/history.ts", "admin/ui/transcript.ts"],
  "{count} event": ["admin/ui/activity.ts"],
  "{count} events": ["admin/ui/activity.ts"],
  "{count} fire": ["admin/ui/history.ts"],
  "{count} fires": ["admin/ui/history.ts"],
  "{count} run": ["admin/ui/metrics.ts"],
  "{count} runs": ["admin/ui/metrics.ts"],
  "{count} model call": ["admin/ui/spend.ts"],
  "{count} model calls": ["admin/ui/spend.ts"],
  "{count} active scope": ["admin/ui/history.ts"],
  "{count} active scopes": ["admin/ui/history.ts"],
  "{count} more scope": ["admin/ui/history.ts"],
  "{count} more scopes": ["admin/ui/history.ts"],
  Admin: ["admin/public/index.html"],
  Conversations: ["admin/ui/transcript.ts", "web-ui/src/contexts.ts"],
  Credentials: ["admin/ui/keychain.ts", "admin/ui/users.ts"],
  Destination: ["admin/ui/artifacts.ts", "web-ui/src/crons.ts", "web-ui/src/webhooks.ts"],
  Done: [
    "admin/ui/artifacts.ts",
    "admin/ui/design.ts",
    "web-ui/src/composer.ts",
    "web-ui/src/connectors.ts",
    "web-ui/src/deploy-permissions.ts",
    "web-ui/src/loops.ts",
    "web-ui/src/model-connect.ts",
    "web-ui/src/webhooks.ts",
  ],
  Egress: ["admin/ui/design.ts"],
  "Everyone in this organization": ["admin/public/index.html", "admin/ui/settings-credentials.ts"],
  "Follow organization": ["admin/public/index.html", "admin/ui/governance.ts"],
  "Human activity": ["admin/public/index.html", "admin/ui/design.ts"],
  "Internal only": ["admin/public/index.html", "admin/ui/integrations.ts"],
  Judgments: ["admin/ui/slack-activity.ts"],
  "Jump to this message in the mirrored Slack channel {container}": [
    "admin/public/index.html",
    "admin/ui/transcript.ts",
  ],
  "Large image. Click to preview full size": ["admin/public/index.html", "admin/ui/artifacts.ts"],
  Live: ["admin/ui/spend.ts"],
  "Needs review": ["admin/ui/design.ts", "web-ui/src/inbox.ts"],
  Onboarding: ["admin/public/index.html", "admin/ui/user-detail.ts"],
  "Only an admin may revoke.": ["admin/public/index.html", "admin/ui/users.ts"],
  Principal: ["admin/ui/activity.ts", "admin/ui/users.ts", "web-ui/src/shell.ts"],
  "Recorded for observability, never sent to the human (shadow-mode rollout)": [
    "admin/public/index.html",
    "admin/ui/transcript.ts",
  ],
  'Remove "{email}" from the list?': ["admin/public/index.html", "admin/ui/users.ts"],
  Restore: ["admin/public/index.html", "admin/ui/settings.ts", "web-ui/src/memory.ts"],
  'Revoke access for "{email}"? They will no longer be able to sign in.': [
    "admin/public/index.html",
    "admin/ui/users.ts",
  ],
  "Revoke failed.": ["admin/public/index.html", "admin/ui/users.ts"],
  "Saving...": ["admin/public/index.html", "admin/ui/integrations-state.ts"],
  "Security posture": ["admin/ui/governance.ts", "admin/ui/user-detail.ts"],
  Slug: ["admin/public/index.html", "admin/ui/settings-credentials.ts"],
  System: ["admin/ui/activity.ts"],
  "Unsaved changes": [
    "admin/public/index.html",
    "admin/ui/artifacts.ts",
    "admin/ui/design.ts",
    "admin/ui/setting-state.ts",
    "admin/ui/settings-credentials.ts",
    "admin/ui/settings.ts",
    "web-ui/src/memory.ts",
  ],
  "You don't administer this scope.": ["admin/public/index.html", "admin/ui/artifacts.ts"],
  "recipient thread {ref}": ["admin/public/index.html", "admin/ui/transcript.ts"],
  "users with keychain entries": ["admin/ui/settings-credentials.ts"],
  "{count} attempts": ["web-ui/src/chat.ts", "web-ui/src/loops.ts"],
  "{count} failed": ["admin/ui/metrics.ts", "web-ui/src/activity-presentation.ts", "web-ui/src/subagent-activity.ts"],
  "{from}–{to} of {total}": ["admin/public/index.html", "admin/ui/shared.ts"],
};

test("every disambiguated key is referenced by exactly the declared call sites", () => {
  const declared = new Set(Object.keys(DECLARED_REFERENCES));
  const indirect = new Set(Object.keys(INDIRECT_ANCHORS));
  for (const key of Object.keys(zhCNDisambiguation)) {
    assert.ok(
      declared.has(key) || indirect.has(key),
      `${JSON.stringify(key)} is in the disambiguation fragment with no declared call site`,
    );
  }
  for (const key of declared) {
    assert.ok(
      key in zhCNDisambiguation,
      `${JSON.stringify(key)} declares references but is no longer a disambiguation entry`,
    );
    assert.ok(
      !indirect.has(key),
      `${JSON.stringify(key)} is declared both literally and indirectly`,
    );
  }
  for (const [key, { at, anchor }] of Object.entries(INDIRECT_ANCHORS)) {
    assert.ok(
      key in zhCNDisambiguation,
      `${JSON.stringify(key)} declares an indirect anchor but is no longer a disambiguation entry`,
    );
    assert.ok(
      referenceSites(key).length === 0,
      `${JSON.stringify(key)} is now passed literally; move it into DECLARED_REFERENCES`,
    );
    const source = ALL_SOURCES.find((candidate) => candidate.path === at);
    assert.ok(source, `${JSON.stringify(key)} anchors to ${at}, which is not a scanned source`);
    assert.match(source.text, anchor, `${JSON.stringify(key)} lost the indirect call site it was declared against`);
  }
  for (const [key, sites] of Object.entries(DECLARED_REFERENCES)) {
    assert.deepEqual(
      referenceSites(key).toSorted(),
      sites.toSorted(),
      `${JSON.stringify(key)} gained or lost a call site — a new use must be declared here with its intended sense`,
    );
  }
});

test("a globally-overridden key stays reachable from only the surfaces that share its sense", () => {
  assert.deepEqual(referenceSites("Admin"), ["admin/public/index.html"]);
  assert.deepEqual(referenceSites("Egress"), ["admin/ui/design.ts"]);
  assert.deepEqual(referenceSites("Follow organization").toSorted(), [
    "admin/public/index.html",
    "admin/ui/governance.ts",
  ]);
  assert.deepEqual(referenceSites("Principal").toSorted(), [
    "admin/ui/activity.ts",
    "admin/ui/users.ts",
    "web-ui/src/shell.ts",
  ]);
});

test("each disambiguated key is actually used at the call sites that were renamed", () => {
  for (const { key, at } of RENAMED) {
    if (key === "Organization · {scope}" || key === "Allow external Slack audiences?") continue;
    assert.ok(
      at.some((source) => source.includes(`"${key}"`)),
      `${key} is declared but no renamed call site references it`,
    );
  }
});

test("the surfaces that kept the original key still resolve to their original meaning", () => {
  setLocale("zh-CN");
  assert.equal(translate("Admin"), "管理", "the admin-console section sense of Admin must be 管理");
  assert.equal(translate("Administrator"), "管理员", "the admin-role sense must stay 管理员");
  assert.equal(translate("Open"), "开放", "the sharing-posture sense of Open must stay 开放");
  assert.equal(translate("Destination"), "投递目标", "the delivery-destination sense must stay 投递目标");
  assert.equal(translate("Credentials"), "凭据", "the roster-column sense of Credentials must be 凭据");
  assert.equal(translate("New"), "新建", "the create-mode sense of New must stay 新建");
  assert.equal(translate("System"), "系统", "the error-origin sense of System must stay 系统");
});

test("the admin console no longer renders the person-sense for the console title", () => {
  assert.doesNotMatch(shell, /_t\("Admin"\)/);
  assert.doesNotMatch(shell, /_t\("Destination"\)/);
  assert.doesNotMatch(shell, /credentials: "Credentials"/);
  assert.match(shell, /_t\("Admin console"\)/);
  assert.match(shell, /_t\("Destination view"\)/);
  assert.match(shell, /credentials: "Credential settings"/);
});
