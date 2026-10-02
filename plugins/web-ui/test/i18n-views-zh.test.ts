import { test } from "node:test";
import assert from "node:assert/strict";
import { setLocale, type LocaleCatalog } from "../../chassis/src/i18n.ts";
import { zhCN } from "../../chassis/src/locales/zh-CN.ts";
import { zhCNWebUiViews } from "../../chassis/src/locales/zh-CN.web-ui-views.ts";

const merged: LocaleCatalog = { ...zhCN, ...zhCNWebUiViews };

function render(locale: "en" | "zh-CN", key: string, vars?: Record<string, string | number>): string {
  setLocale(locale);
  const template = locale === "zh-CN" ? (merged[key] ?? key) : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

function zh(key: string, vars?: Record<string, string | number>): string {
  return render("zh-CN", key, vars);
}

function en(key: string, vars?: Record<string, string | number>): string {
  return render("en", key, vars);
}

test("chat, composer, inbox, sessions and skills strings render as Chinese", () => {
  assert.equal(zh("Ask anything"), "随便问点什么");
  assert.equal(zh("Queue for after this turn"), "排队到本轮结束后发送");
  assert.equal(zh("Steer the running task with this instead of waiting"), "用这条消息引导正在执行的任务，无需等待");
  assert.equal(zh("Allow for session"), "本会话内允许");
  assert.equal(zh("Attach files"), "添加附件");
  assert.equal(zh("No messages in this view yet. Sync to check for new messages."), "此视图中还没有消息。同步一下看看有没有新消息。");
  assert.equal(zh("Choose the Loops you want to review here."), "选择你想在这里查看的循环。");
  assert.equal(zh("Couldn't load the inbox: {error}", { error: "boom" }), "无法加载收件箱：boom");
  assert.equal(zh("Read-only"), "只读");
  assert.equal(zh("Start a new chat in {name}", { name: "Ops" }), "在 Ops 中开始新对话");

  assert.equal(zh("New skill"), "新技能");
  assert.equal(zh("No skills match these filters."), "没有符合这些筛选条件的技能。");
  assert.equal(zh("Publish /{name} to {scope}?", { name: "watch", scope: "Ops" }), "要把 /watch 发布到 Ops 吗？");
});

test("placeholders survive translation and interpolate", () => {
  assert.equal(zh("{count} skills in {groups} groups", { count: 3, groups: 2 }), "2 个分组中的 3 个技能");
  assert.equal(zh("{count} selected", { count: 4 }), "已选择 4 项");
  assert.equal(zh("You replied in {where} {when}", { where: "Slack", when: "5 分钟前" }), "你已于 5 分钟前 在 Slack 中回复");
  assert.ok(zh("Description {description}; instructions {instructions}.", { description: "未改动", instructions: "已改动" }).includes("已改动"));
});

test("English remains the fallback for unlisted keys", () => {
  assert.equal(en("Ask anything"), "Ask anything");
  assert.equal(en("{count} skills in {groups} groups", { count: 3, groups: 2 }), "3 skills in 2 groups");
});

test("every catalog value keeps its placeholders", () => {
  for (const [key, value] of Object.entries(zhCNWebUiViews)) {
    for (const name of key.matchAll(/\{(\w+)\}/g)) {
      assert.ok(
        value.includes(`{${name[1]}}`),
        `translation for ${JSON.stringify(key)} drops placeholder {${name[1]}}`,
      );
    }
  }
});

test("the catalog has no empty translations", () => {
  for (const [key, value] of Object.entries(zhCNWebUiViews)) {
    assert.ok(value.trim().length > 0, `empty translation for ${JSON.stringify(key)}`);
    assert.equal(value, value.trim(), `untrimmed translation for ${JSON.stringify(key)}`);
  }
});
