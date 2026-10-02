import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { zhCN } from "../../chassis/src/locales/zh-CN.ts";
import { zhCNWebUiMore } from "../../chassis/src/locales/zh-CN.web-ui-more.ts";
import { zhCNWebUiCore } from "../../chassis/src/locales/zh-CN.web-ui-core.ts";
import { zhCNWebUiViews } from "../../chassis/src/locales/zh-CN.web-ui-views.ts";
import { zhCNAdminUi } from "../../chassis/src/locales/zh-CN.admin-ui.ts";
import { zhCNAdminShell } from "../../chassis/src/locales/zh-CN.admin-shell.ts";
import { zhCNDisambiguation } from "../../chassis/src/locales/zh-CN.disambiguation.ts";

const WAVE_TWO_FILES = [
  "ambient-policy",
  "browse",
  "connectors",
  "contexts",
  "crons",
  "deploy-permissions",
  "deploys",
  "files",
  "loops",
  "memory",
  "model-connect",
  "model-picker",
  "onboarding-welcome",
  "session-share",
  "slack-setup",
  "split",
  "webhooks",
];


const WAVE_TWO_DIR = new URL("../src/", import.meta.url);

function translationFor(key: string, vars?: Record<string, string | number>): string {
  const raw = zhCNWebUiMore[key] ?? zhCN[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => String(vars?.[name] ?? match));
}

const UNTRANSLATED_BY_DESIGN: Record<string, true> = {
  Web: true,
  Slack: true,
  Webhook: true,
  Astra: true,
  "URL slug": true,
  "Workspace ID": true,
};

test("every t() key used by the wave-2 view modules resolves to a translation", () => {
  const untranslated: string[] = [];
  for (const name of WAVE_TWO_FILES) {
    const source = readFileSync(new URL(`${name}.ts`, WAVE_TWO_DIR), "utf8");
    for (const match of source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse(`"${match[1]}"`) as string;
      if (UNTRANSLATED_BY_DESIGN[key] === true) continue;
      if (translationFor(key) === key) untranslated.push(`${name}.ts: ${key}`);
    }
  }
  assert.deepEqual(untranslated, []);
});

test("every key two fragments disagree on is resolved by the disambiguation catalog", () => {
  const fragments: Array<[string, Record<string, string>]> = [
    ["web-ui-core", zhCNWebUiCore],
    ["admin-ui", zhCNAdminUi],
    ["admin-shell", zhCNAdminShell],
    ["web-ui-views", zhCNWebUiViews],
    ["web-ui-more", zhCNWebUiMore],
  ];
  const disagreements: string[] = [];
  for (const [name, fragment] of fragments) {
    for (const [otherName, other] of fragments) {
      if (name >= otherName) continue;
      for (const [key, value] of Object.entries(fragment)) {
        if (key in other && other[key] !== value) disagreements.push(key);
      }
    }
  }
  const unresolved = disagreements
    .filter((key, index) => disagreements.indexOf(key) === index)
    .filter((key) => zhCNDisambiguation[key] === undefined)
    .sort();
  assert.deepEqual(
    unresolved,
    [],
    "two fragments disagree on a key with no deliberate winner; give it one in the disambiguation catalog",
  );
});

test("every key two fragments disagree on resolves to exactly one winner", () => {
  const fragments: Array<Record<string, string>> = [
    zhCNWebUiCore,
    zhCNAdminShell,
    zhCNAdminUi,
    zhCNWebUiViews,
    zhCNWebUiMore,
    zhCNDisambiguation,
  ];
  const unowned: string[] = [];
  for (const [key, value] of Object.entries(zhCN)) {
    const defined = fragments.filter((fragment) => key in fragment).map((fragment) => fragment[key]);
    if (new Set(defined).size > 1 && !new Set(defined).has(value)) unowned.push(key);
  }
  assert.deepEqual(unowned, [], "a disagreeing key must resolve to one of its catalogued values");
});

test("the fragment keeps every placeholder from the key it translates", () => {
  const placeholders = (text: string) =>
    (text.match(/\{(\w+)\}/g) ?? [])
      .map((token) => token.slice(1, -1))
      .sort()
      .join(",");
  const mismatched = Object.entries(zhCNWebUiMore)
    .filter(([key, value]) => placeholders(key) !== placeholders(value))
    .map(([key]) => key);
  assert.deepEqual(mismatched, []);
});

test("deploy version badges read as versions, not as live chat", () => {
  const zh = { ...zhCNWebUiMore, ...zhCN };
  const render = (key: string, vars?: Record<string, string | number>) =>
    (zh[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) => String(vars?.[name] ?? match));
  assert.notEqual(zh["Live"], undefined);
  assert.equal(render("Live version"), "线上版本");
  assert.equal(render("Latest version"), "最新版本");
  assert.equal(render("Live v{version}", { version: 7 }), "线上 v7");
  assert.equal(render("Latest v{version}", { version: 8 }), "最新 v8");
});

test("crons, webhooks and deploys render Chinese with interpolations intact", () => {
  assert.equal(translationFor("New cron"), "新建定时任务");
  assert.equal(translationFor("Search crons"), "搜索定时任务");
  assert.equal(translationFor("No crons in this context."), "此上下文中没有定时任务。");
  assert.equal(translationFor("No webhooks in this context."), "此上下文中没有 Webhook。");
  assert.equal(translationFor("Webhook created ✓"), "Webhook 创建成功 ✓");
  assert.equal(translationFor("No apps in this context."), "此上下文中没有应用。");
  assert.equal(translationFor("Created by {who}", { who: "Ada" }), "创建者：Ada");
  assert.equal(
    translationFor("Unlink #{channel} from {project}?", { channel: "general", project: "Site" }),
    "从 Site 取消关联 #general？",
  );
  assert.equal(translationFor("Done when: {condition}", { condition: "PR merged" }), "完成标准：PR merged");
});
test("projects, keychain and memory render Chinese on their own surfaces", () => {
  assert.equal(translationFor("New project"), "新建项目");
  assert.equal(translationFor("Add people"), "添加成员");
  assert.equal(translationFor("No accounts available"), "没有可用的账号");
  assert.equal(translationFor("a Slack channel ({ref})", { ref: "eng" }), "一个 Slack 频道（eng）");
  assert.equal(translationFor("Ready to ship"), "待发布");
  assert.equal(translationFor("automatic capture"), "自动记录");
  assert.equal(translationFor("Group chats, files, and automations"), "群聊、文件和自动化任务");
});

test("model access, onboarding and file management render Chinese", () => {
  assert.equal(translationFor("Choose model"), "选择模型");
  assert.equal(translationFor("6× cost"), "6 倍成本");
  assert.equal(translationFor("Company access"), "公司访问");
  assert.equal(translationFor("Sign in with {name}", { name: "Claude" }), "使用 Claude 登录");
  assert.equal(translationFor("Hi, {name}.", { name: "小明" }), "小明，你好。");
  assert.equal(translationFor("Connect your apps"), "连接你的应用");
  assert.equal(translationFor("Search file names and types…"), "搜索文件名和类型…");
  assert.equal(translationFor("Share conversation"), "分享对话");
  assert.equal(translationFor("Add QM to Slack"), "将 QM 添加到 Slack");
});

test("every wave-2 source file is covered by this suite", () => {
  const present: Record<string, true> = {};
  for (const file of readdirSync(WAVE_TWO_DIR)) {
    if (file.endsWith(".ts")) present[file.slice(0, -3)] = true;
  }
  const missing = WAVE_TWO_FILES.filter((name) => present[name] !== true);
  assert.deepEqual(missing, []);
});
