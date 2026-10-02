import { toolCategory, toolRowKind, type TimelineItem, type ToolPayload, type ToolRowModel } from "./timeline.ts";
import type { WorkBlock } from "./core-bridge.ts";
import { t } from "../../chassis/src/i18n-lit.ts";

export type ActivityCategory = "read" | "search" | "execute" | "other";

function compactPath(path: string): string {
  const parts = path.replace(/\/$/, "").split("/");
  return parts.at(-1) === "SKILL.md" ? parts.slice(-2).join("/") : parts.at(-1) || path;
}

function shellWords(command: string): string[] | null {
  if (command.includes("\n")) return null;
  const pattern = /\s*(?:'([^']*)'|"([^"$`\\]*)"|([^\s'"\\;&|<>`$()]+))/gy;
  const words: string[] = [];
  while (pattern.lastIndex < command.length) {
    if (!command.slice(pattern.lastIndex).trim()) break;
    const match = pattern.exec(command);
    if (!match) return null;
    if (pattern.lastIndex < command.length && !/\s/.test(command[pattern.lastIndex]!)) return null;
    words.push(match[1] ?? match[2] ?? match[3]!);
  }
  return words;
}

export function activityDescription(
  call: ToolPayload,
  result: ToolPayload = {},
): {
  category: ActivityCategory;
  target: string;
} {
  const tool = toolCategory({ ...result, ...call });
  if (tool === "read") return { category: "read", target: compactPath(call.path ?? result.path ?? "") };
  if (tool === "skill") {
    const name = call.name ?? result.name ?? "";
    const path = call.path ?? result.path ?? "SKILL.md";
    return { category: "read", target: path === "SKILL.md" ? name : `${name}/${compactPath(path)}` };
  }
  if (tool !== "execute") return { category: "other", target: "" };
  const command = call.command ?? "";
  const words = shellWords(command);
  if (words?.[0] === "cat" && words.length === 2 && !words[1]!.startsWith("-")) {
    return { category: "read", target: compactPath(words[1]!) };
  }
  if (
    words?.[0] === "sed" &&
    words.length === 4 &&
    words[1] === "-n" &&
    /^\d+(?:,\d+)?p$/.test(words[2]!) &&
    !words[3]!.startsWith("-")
  ) {
    return { category: "read", target: compactPath(words[3]!) };
  }
  if (words?.[0] === "rg" && words[1] === "--files" && words.length <= 3 && !words[2]?.startsWith("-")) {
    return { category: "search", target: searchTarget("files", words[2] ? compactPath(words[2]) : "") };
  }
  if (words && ["rg", "grep"].includes(words[0]!)) {
    const args = words.slice(1);
    const flags = new Set([
      "-n",
      "--line-number",
      "-i",
      "--ignore-case",
      "-l",
      "--files-with-matches",
      "-F",
      "--fixed-strings",
      "-w",
      "--word-regexp",
      "--hidden",
    ]);
    while (args.length && flags.has(args[0]!)) args.shift();
    if (args.length >= 1 && args.length <= 2 && !args.some((arg) => arg.startsWith("-"))) {
      return { category: "search", target: searchTarget(args[0]!, args[1] ? compactPath(args[1]) : "") };
    }
  }
  return { category: "execute", target: command.split("\n")[0] ?? "" };
}

function searchTarget(pattern: string, dir: string): string {
  return dir ? t("{pattern} in {dir}", { pattern, dir }) : pattern;
}

export function activityLabel(row: ToolRowModel, status: WorkBlock["status"]): string | null {
  const call = (row.call?.payload ?? {}) as ToolPayload;
  const result = (row.result?.payload ?? {}) as ToolPayload;
  const { category, target } = activityDescription(call, result);
  const state = toolRowKind(row, status);
  if (state === "approval") return null;
  const exit =
    state === "ok" &&
    toolCategory({ ...result, ...call }) === "execute" &&
    typeof result.code === "number" &&
    result.code !== 0
      ? ` · ${t("exit {code}", { code: result.code })}`
      : "";
  const purpose = typeof call.purpose === "string" ? call.purpose.trim() : "";
  if (purpose) {
    if (state === "failed") return t("{purpose} · Failed", { purpose });
    if (state === "attempted") return t("{purpose} · Unconfirmed", { purpose });
    return purpose + exit;
  }
  if (category === "other") return null;
  const templates: Record<Exclude<ActivityCategory, "other">, Record<string, string>> = {
    read: {
      ok: "Read {target}",
      running: "Reading {target}",
      failed: "Failed to read {target}",
      attempted: "Tried reading {target}",
    },
    search: {
      ok: "Searched for {target}",
      running: "Searching for {target}",
      failed: "Failed searching for {target}",
      attempted: "Tried searching for {target}",
    },
    execute: {
      ok: "Ran {target}",
      running: "Running {target}",
      failed: "Failed running {target}",
      attempted: "Tried running {target}",
    },
  };
  if (state === "ok" && (category === "read" || category === "execute") && target) return target + exit;
  return t(templates[category][state]!, { target: target || t(category === "execute" ? "command" : "file") }) + exit;
}

export function activityGroupSummary(
  items: TimelineItem[],
  status: WorkBlock["status"],
): {
  label: string;
  category: ActivityCategory;
  attention: boolean;
} {
  const categories = new Set<ActivityCategory>();
  let failed = 0;
  let running = 0;
  let approvals = 0;
  let attempted = 0;
  for (const item of items) {
    if (item.kind === "approval") approvals++;
    if (item.kind !== "tool") continue;
    const state = toolRowKind(item.row, status);
    if (state === "failed") failed++;
    if (state === "running") running++;
    if (item.row.pending) approvals++;
    if (state === "attempted") attempted++;
    categories.add(
      activityDescription(
        (item.row.call?.payload ?? {}) as ToolPayload,
        (item.row.result?.payload ?? {}) as ToolPayload,
      ).category,
    );
  }
  const active = running > 0;
  const phrases = [];
  if (categories.has("read")) phrases.push(t(active ? "Reading files" : "Read files"));
  if (categories.has("search")) phrases.push(t(active ? "Searching files" : "Searched files"));
  if (categories.has("execute")) phrases.push(t(active ? "Running commands" : "Ran commands"));
  if (categories.has("other")) phrases.push(t(active ? "Using tools" : "Used tools"));
  const base =
    phrases
      .map((phrase, i) => (i ? phrase.toLowerCase() : phrase))
      .join(t(", ")) || t("Thought");
  const notes = [
    failed ? t("{count} failed", { count: failed }) : "",
    approvals ? t("Approval needed") : "",
    attempted ? t("{count} unconfirmed", { count: attempted }) : "",
  ].filter(Boolean);
  return {
    label: [base, ...notes].join(" · "),
    category:
      (["search", "read", "execute"] as ActivityCategory[]).find((category) => categories.has(category)) ?? "other",
    attention: failed > 0 || approvals > 0,
  };
}

export function thinkingPresentation(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const heading = /^(?:#{1,6} +([^\n]+)|\*\*([^\n]+?)\*\*|__([^\n]+?)__)(?:\r?\n|$)/.exec(trimmed);
  if (!heading) return { title: t("Thinking"), body: trimmed };
  const title = (heading[1] ?? heading[2] ?? heading[3]!).replace(/ +#+$/, "").trim();
  return { title, body: trimmed.slice(heading[0].length).trim() };
}

export function sessionPresentation(
  row: ToolRowModel,
  status: WorkBlock["status"],
): { label: string; target: string; preview: string } | null {
  const call = (row.call?.payload ?? {}) as ToolPayload & {
    target?: string;
    text?: string;
    task?: string;
    interrupt?: boolean;
  };
  const result = (row.result?.payload ?? {}) as ToolPayload & { title?: string; sessionId?: string };
  if (toolCategory({ ...result, ...call }) !== "session") return null;
  const action = call.interrupt === true ? "interrupt" : (call.action ?? result.action ?? "");
  const actions: Record<string, { ok: string; running: string; failed: string; attempted: string; bare: string }> = {
    open: {
      ok: "Created",
      running: "Creating",
      failed: "Failed to create",
      attempted: "Tried to create",
      bare: "create",
    },
    write: {
      ok: "Sent message to",
      running: "Sending message to",
      failed: "Failed to send message to",
      attempted: "Tried to send message to",
      bare: "send message to",
    },
    send_message: {
      ok: "Sent message to",
      running: "Sending message to",
      failed: "Failed to send message to",
      attempted: "Tried to send message to",
      bare: "send message to",
    },
    followup_task: {
      ok: "Continued",
      running: "Continuing",
      failed: "Failed to continue",
      attempted: "Tried to continue",
      bare: "continue",
    },
    read: {
      ok: "Read updates from",
      running: "Reading updates from",
      failed: "Failed to read updates from",
      attempted: "Tried to read updates from",
      bare: "read updates from",
    },
    wait: { ok: "Waited", running: "Waiting", failed: "Failed to wait", attempted: "Tried to wait", bare: "wait" },
    interrupt: {
      ok: "Interrupted",
      running: "Interrupting",
      failed: "Failed to interrupt",
      attempted: "Tried to interrupt",
      bare: "interrupt",
    },
    close: { ok: "Closed", running: "Closing", failed: "Failed to close", attempted: "Tried to close", bare: "close" },
    list: { ok: "Listed", running: "Listing", failed: "Failed to list", attempted: "Tried to list", bare: "list" },
    new: { ok: "Started", running: "Starting", failed: "Failed to start", attempted: "Tried to start", bare: "start" },
    fork: {
      ok: "Forked into",
      running: "Forking into",
      failed: "Failed to fork into",
      attempted: "Tried to fork into",
      bare: "fork into",
    },
  };
  const verbs = actions[action];
  if (!verbs) return null;
  const state = toolRowKind(row, status);
  const label =
    state === "running"
      ? t(verbs.running)
      : state === "failed"
        ? t(verbs.failed)
        : state === "attempted"
          ? t(verbs.attempted)
          : state === "approval"
            ? t(row.pending ? "Approval needed to {action}" : "Approval requested to {action}", { action: t(verbs.bare) })
            : t(verbs.ok);
  const target =
    result.title ||
    call.name ||
    call.target ||
    result.sessionId ||
    t(({ open: "subagent", new: "session", fork: "session", list: "sessions" } as Record<string, string>)[action] ?? "subagents");
  const preview = ["write", "send_message", "followup_task"].includes(action)
    ? (call.text ?? call.task ?? "").replace(/\s+/g, " ").trim()
    : "";
  return { label, target, preview };
}

export function activityGroups(items: TimelineItem[]): TimelineItem[][] {
  const groups: TimelineItem[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (item.kind === "text" || !last || last[0]?.kind === "text") groups.push([item]);
    else last.push(item);
  }
  return groups;
}
