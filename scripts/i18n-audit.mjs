#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

export const BUCKETS = ["UI_STRING", "NON_UI", "ALREADY_TRANSLATED"];

export const TRANSLATION_CALLEES = ["t", "translate", "i18n.t", "i18n.translate", "this.t", "tr", "$t", "_t"];

export const SCAN_TARGETS = [
  "plugins/web-ui/src",
  "plugins/web-ui/server",
  "plugins/admin/ui",
  "plugins/admin/src",
  "plugins/admin/public/index.html",
];

const MARKUP_TAGS = new Set([
  "html",
  "svg",
  "htmlOnly",
  "unsafeHTML",
  "unsafeSVG",
  "staticHtml",
  "litHtml",
  "template",
]);

const UI_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "placeholder",
  "title",
  "alt",
  "label",
  "heading",
  "tooltip",
  "caption",
  "subtitle",
]);

const UI_ASSIGN_PROPS = "title|textContent|innerText|placeholder|alt|ariaLabel|label";

const DISPLAY_KEYS = new Set([
  "label",
  "title",
  "text",
  "message",
  "heading",
  "placeholder",
  "description",
  "hint",
  "tooltip",
  "subtitle",
  "caption",
  "emptyText",
  "empty",
  "emptyState",
  "ariaLabel",
  "confirmLabel",
  "cancelLabel",
]);

const PLURAL_CALLEES = /(^|\.)(plural|pluralize|ngettext)$/;
const LOG_CALLEES =
  /^(console\.\w+|log|logger|logInfo|logError|logWarn|logDebug|logEvent|audit|trace|debug|print|report|emitLog)$/;
const UI_CALLEES =
  /^(toast|notify|showToast|setError|showError|showMessage|emptyState|heading|label|title|placeholder|confirm|alert|prompt|describe|tooltip)$/;

const MACHINE_WORDS = new Set([
  "ok",
  "err",
  "nok",
  "dirty",
  "clean",
  "saving",
  "saved",
  "warn",
  "warning",
  "pending",
  "active",
  "inactive",
  "success",
  "successful",
  "failed",
  "failure",
  "idle",
  "running",
  "stopped",
  "stop",
  "queued",
  "draft",
  "published",
  "archived",
  "deleted",
  "open",
  "closed",
  "complete",
  "completed",
  "cancelled",
  "canceled",
  "enabled",
  "disabled",
  "on",
  "off",
  "true",
  "false",
  "null",
  "undefined",
  "light",
  "dark",
  "system",
  "auto",
  "manual",
  "asc",
  "desc",
  "none",
  "all",
  "any",
  "admin",
  "user",
  "org",
  "personal",
  "channel",
  "team",
  "group",
  "workspace",
  "default",
  "custom",
  "primary",
  "secondary",
  "ghost",
  "link",
  "button",
  "card",
  "header",
  "footer",
  "row",
  "cell",
  "list",
  "grid",
  "table",
  "form",
  "input",
  "modal",
  "dialog",
  "drawer",
  "panel",
  "sidebar",
  "nav",
  "menu",
  "tooltip",
  "badge",
  "chip",
  "tag",
  "banner",
  "toast",
  "avatar",
  "icon",
  "image",
  "body",
  "main",
  "content",
  "container",
  "wrapper",
  "hidden",
  "visible",
  "show",
  "hide",
  "enter",
  "escape",
  "tab",
  "shift",
  "control",
  "alt",
  "meta",
  "backspace",
  "delete",
  "home",
  "end",
  "space",
  "pageup",
  "pagedown",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

const BRAND_TOKENS = new Set(["qm", "(admin)", "(portal)", "(web)", "(beta)"]);

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;
const MIME_LIKE = /^[\w.+-]+\/[\w.+*-]+$/;
const LOCALE_LIKE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CAMEL_LIKE = /^[a-z]+(?:[A-Z][a-z0-9]*)+$/;
const LOWER_TOKEN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const CSS_SELECTOR = /(^|\s)[.#][\w-]/;
const CSS_VAR = /(^|\s)--[\w-]/;
const HEADER_NAME = /^[A-Z][A-Za-z0-9]*(-[A-Za-z0-9]+)+$/;
const COMPARE_BEFORE = /(\|\||&&|===|!==|==|!=|>=|<=|=>|[<>])\s*$/;
const COMPARE_AFTER = /^\s*(===|!==|==|!=|&&|\|\|)/;
const REPEATED_DATA_LIMIT = 20;
const LOG_PREFIX = /^\[[\w.:/-]+\]/;

export function looksLikeEnglish(text) {
  return /[A-Za-z]{2}/.test(text);
}

export function isTechnicalText(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!looksLikeEnglish(trimmed)) return true;
  if (/^[_$\-.]/.test(trimmed)) return true;
  if (/['"`;=$]/.test(trimmed)) return true;
  if (CSS_SELECTOR.test(trimmed) || CSS_VAR.test(trimmed)) return true;
  if (HEADER_NAME.test(trimmed)) return true;
  if (/[-_]$/.test(trimmed)) return true;
  if (/^[A-Za-z]+(Error|Exception|Warning)$/.test(trimmed)) return true;
  if (/^[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(trimmed)) return true;
  if (/^[a-z][\w-]*(\s+[a-z][\w-]*)+$/.test(trimmed)) return true;
  if ((trimmed.match(/[0-9][A-Za-z]|[A-Za-z][0-9]/g) ?? []).length >= 4) return true;
  if (/\s/.test(trimmed)) {
    if (/\n/.test(trimmed)) return true;
    if (/[{}<>\\]/.test(trimmed)) return true;
    if (/:\s/.test(trimmed) && trimmed.length > 24) return true;
    if (URL_LIKE.test(trimmed) || EMAIL_LIKE.test(trimmed)) return true;
    if (trimmed.endsWith(";")) return true;
    return false;
  }
  if (MACHINE_WORDS.has(trimmed.toLowerCase())) return true;
  if (URL_LIKE.test(trimmed) || EMAIL_LIKE.test(trimmed)) return true;
  if (MIME_LIKE.test(trimmed) && trimmed.includes("/")) return true;
  if (LOCALE_LIKE.test(trimmed) && trimmed.includes("-")) return true;
  if (/[A-Z]/.test(trimmed) && trimmed === trimmed.toUpperCase()) return true;
  if (/\d/.test(trimmed)) return true;
  if (/[./#:]/.test(trimmed)) return true;
  if (CAMEL_LIKE.test(trimmed)) return true;
  if (LOWER_TOKEN.test(trimmed)) return true;
  return false;
}

function lastSegment(callee) {
  const parts = callee.split(".");
  return parts[parts.length - 1] ?? callee;
}

export function classifyCodeString(text, ctx) {
  const trimmed = text.trim();
  if (!looksLikeEnglish(trimmed)) return "NON_UI";
  if (ctx.typeScope) return "NON_UI";
  if (ctx.inImport) return "NON_UI";
  if (ctx.afterDot) return "NON_UI";
  if (ctx.objectKey) return "NON_UI";
  if (ctx.union) return "NON_UI";
  if (ctx.caseLabel) return "NON_UI";
  if (ctx.comparison) return "NON_UI";
  if (
    ctx.calleeFirst &&
    (TRANSLATION_CALLEES.includes(ctx.calleeFirst) || TRANSLATION_CALLEES.includes(lastSegment(ctx.calleeFirst)))
  )
    return "ALREADY_TRANSLATED";
  if (ctx.callee && LOG_CALLEES.test(ctx.callee)) return "NON_UI";
  if (ctx.logPrefix) return "NON_UI";
  if (ctx.callee && PLURAL_CALLEES.test(ctx.callee)) return "UI_STRING";
  if (ctx.callee && UI_CALLEES.test(ctx.callee)) return "UI_STRING";
  if (ctx.assignProp) return "UI_STRING";
  if (ctx.displayKey) return "UI_STRING";
  if (BRAND_TOKENS.has(trimmed.toLowerCase())) return "NON_UI";
  if (isTechnicalText(trimmed)) return "NON_UI";
  return "UI_STRING";
}

export function classifyTextNode(text) {
  const bare = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/&nbsp;/g, " ")
    .trim();
  if (!looksLikeEnglish(bare)) return "NON_UI";
  if (BRAND_TOKENS.has(bare.toLowerCase())) return "NON_UI";
  if (/^\(?[a-z][a-z-]*\)?[.,:;]?$/.test(bare)) return "NON_UI";
  if (isTechnicalText(bare)) return "NON_UI";
  return "UI_STRING";
}

function lineIndexOf(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function precedingName(src, offset) {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  if (i < 0) return "";
  const match = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)$/.exec(src.slice(0, i + 1));
  return match ? match[1].replace(/\s+/g, "") : "";
}

function precedingChar(src, offset) {
  let i = offset - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  return i >= 0 ? src[i] : "";
}

function statementBefore(src, offset) {
  let i = offset - 1;
  while (i >= 0 && src[i] !== ";" && src[i] !== "\n" && src[i] !== "{" && src[i] !== "}") i--;
  return src.slice(i + 1, offset);
}

function skipTarget(ranges, i) {
  for (const [a, b] of ranges) if (i >= a && i < b) return b;
  return -1;
}

function scanRegion(src, region, skipRanges, record) {
  const rootType = region.markup ? "markup" : "code";
  const frames = [{ type: rootType, root: true, pendingClose: false, braceDepth: 0, parens: [] }];
  let i = region.start;
  const limit = region.end;
  let textStart = -1;

  const flushText = (from, to) => {
    if (from < 0 || to <= from) return;
    const raw = src.slice(from, to);
    record(classifyTextNode(raw), from, "markup-text", raw);
  };

  while (i < limit) {
    const skipTo = skipTarget(skipRanges, i);
    if (skipTo >= 0) {
      i = skipTo;
      continue;
    }
    const frame = frames[frames.length - 1];
    const ch = src[i];

    if (frame.type === "opaque") {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        frames.pop();
        i++;
        continue;
      }
      if (ch === "$" && src[i + 1] === "{") {
        frames.push({ type: "code", root: false, pendingClose: true, braceDepth: 0, parens: [] });
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (frame.type === "markup") {
      if (frame.inTag) {
        if (ch === ">") {
          frame.inTag = false;
          i++;
          continue;
        }
        if (/\s/.test(ch) || ch === "/") {
          i++;
          continue;
        }
        if (ch === "$" && src[i + 1] === "{") {
          frames.push({ type: "code", root: false, pendingClose: true, braceDepth: 0, parens: [] });
          i += 2;
          continue;
        }
        const nameMatch = /^[^\s=/>]+/.exec(src.slice(i));
        const attrName = (nameMatch ? nameMatch[0] : "").toLowerCase();
        i += nameMatch ? nameMatch[0].length : 1;
        let j = i;
        while (j < limit && /\s/.test(src[j])) j++;
        if (src[j] !== "=") continue;
        j++;
        while (j < limit && /\s/.test(src[j])) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") continue;
        const end = src.indexOf(quote, j + 1);
        if (end < 0 || end >= limit) {
          i = j;
          continue;
        }
        if (UI_ATTRS.has(attrName)) {
          const raw = src.slice(j + 1, end);
          record(classifyTextNode(raw), j + 1, `attr:${attrName}`, raw);
        }
        i = end + 1;
        continue;
      }
      if (ch === "`" && !frame.root) {
        flushText(textStart, i);
        textStart = -1;
        frames.pop();
        i++;
        continue;
      }
      if (ch === "<") {
        flushText(textStart, i);
        textStart = -1;
        if (src[i + 1] === "!" && src[i + 2] === "-") {
          const close = src.indexOf("-->", i + 3);
          i = close < 0 ? limit : close + 3;
          continue;
        }
        const tagName = /^<\/?[A-Za-z][\w-]*/.exec(src.slice(i, limit));
        if (!tagName) {
          i++;
          continue;
        }
        frame.inTag = true;
        i += tagName[0].length;
        continue;
      }
      if (ch === "$" && src[i + 1] === "{") {
        flushText(textStart, i);
        textStart = -1;
        frames.push({ type: "code", root: false, pendingClose: true, braceDepth: 0, parens: [] });
        i += 2;
        continue;
      }
      if (textStart < 0) textStart = i;
      i++;
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 || nl > limit ? limit : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close < 0 || close > limit ? limit : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < limit && src[j] !== ch) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "\n") break;
        j++;
      }
      const start = i + 1;
      const raw = src.slice(start, Math.min(j, limit));
      const paren = frame.parens.length ? frame.parens[frame.parens.length - 1] : null;
      const callee = paren ? paren.callee : "";
      const calleeFirst = paren && paren.args === 0 ? paren.callee : "";
      const before = statementBefore(src, start);
      const assignMatch = new RegExp(`(?:^|[;{}\\n])\\s*(?:[\\w$[\\]"'.]+\\.)?(?:${UI_ASSIGN_PROPS})\\s*=\\s*$`).exec(
        before,
      );
      const keyMatch = /(?:^|[;{}\n(,])\s*([A-Za-z_$][\w$]*)\s*$/.exec(before);
      record(
        classifyCodeString(raw, {
          typeScope: (frame.typeDepth ?? 0) > 0,
          inImport: frame.inImport,
          afterDot: precedingChar(src, start) === ".",
          objectKey: precedingChar(src, start) === "{" || precedingChar(src, start) === ",",
          union:
            precedingChar(src, start) === "|" ||
            /^\s*[|&]/.test(src.slice(j, j + 4)) ||
            /\b(Record|Array|ReadonlyArray|Partial|Required|Exclude|Extract|Pick|Omit)\s*<\s*$/.test(before),
          caseLabel: frame.caseLabel,
          comparison: COMPARE_BEFORE.test(before) || COMPARE_AFTER.test(src.slice(j, j + 8)),
          callee,
          calleeFirst,
          logPrefix: LOG_PREFIX.test(raw.trim()),
          assignProp: assignMatch ? UI_ASSIGN_PROPS : "",
          displayKey: keyMatch && DISPLAY_KEYS.has(keyMatch[1]) ? keyMatch[1] : "",
        }),
        start,
        callee ? `call:${callee}` : "literal",
        raw,
      );
      i = Math.min(j + 1, limit);
      continue;
    }
    if (ch === "`") {
      const tag = precedingName(src, i);
      frames.push({ type: MARKUP_TAGS.has(tag) ? "markup" : "opaque", inTag: false, braceDepth: 0, parens: [] });
      i++;
      continue;
    }
    if (ch === "{") {
      frame.braceDepth++;
      if (frame.pendingType) {
        frame.typeDepth = (frame.typeDepth ?? 0) + 1;
        frame.pendingType = false;
      }
      i++;
      continue;
    }
    if (ch === "}") {
      if (frame.braceDepth === 0 && frame.pendingClose) {
        frames.pop();
        i++;
        continue;
      }
      frame.braceDepth--;
      if ((frame.typeDepth ?? 0) > 0) frame.typeDepth--;
      i++;
      continue;
    }
    if (ch === "(") {
      frame.parens.push({ callee: precedingName(src, i), args: 0, braceDepth: frame.braceDepth });
      i++;
      continue;
    }
    if (ch === ")") {
      const top = frame.parens[frame.parens.length - 1];
      if (top && top.braceDepth === frame.braceDepth) frame.parens.pop();
      i++;
      continue;
    }
    if (ch === ",") {
      const top = frame.parens[frame.parens.length - 1];
      if (top && top.braceDepth === frame.braceDepth) top.args++;
      i++;
      continue;
    }
    if (ch === ";") {
      frame.caseLabel = false;
      frame.inImport = false;
      frame.pendingType = false;
      i++;
      continue;
    }
    if (ch === "/") {
      const before = precedingChar(src, i);
      if (before && /[\w$)\]}'"`]/.test(before)) {
        i++;
        continue;
      }
      let j = i + 1;
      let inClass = false;
      while (j < limit) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if ((src[j] === "/" && !inClass) || src[j] === "\n") break;
        j++;
      }
      i = Math.min(j + 1, limit);
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < limit && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (word === "import" || word === "from") frame.inImport = true;
      else if (word === "case") frame.caseLabel = true;
      else if (["interface", "enum", "type", "namespace"].includes(word)) frame.pendingType = true;
      else if (word !== "default") frame.caseLabel = false;
      i = j;
      continue;
    }
    i++;
  }
}

function regionsOf(src, isHtml) {
  if (!isHtml) return { regions: [{ start: 0, end: src.length, skip: [] }] };
  const markupSkip = [];
  const codeSkip = [];
  const regions = [{ start: 0, end: src.length, markup: true, skip: markupSkip }];
  let m;
  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
  while ((m = styleRe.exec(src))) {
    markupSkip.push([m.index, m.index + m[0].length]);
    codeSkip.push([m.index, m.index + m[0].length]);
  }
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  while ((m = scriptRe.exec(src))) {
    markupSkip.push([m.index, m.index + m[0].length]);
    const bodyStart = m.index + m[0].indexOf(">") + 1;
    const bodyEnd = m.index + m[0].length - "</script".length;
    if (bodyEnd > bodyStart) regions.push({ start: bodyStart, end: bodyEnd, skip: codeSkip });
  }
  return { regions };
}

export function classifySource(src, opts = {}) {
  const file = opts.file ?? "<memory>";
  const isHtml = opts.html === true;
  const lineAt = lineIndexOf(src);
  const findings = [];
  const { regions } = regionsOf(src, isHtml);
  for (const region of regions) {
    scanRegion(src, region, region.skip, (bucket, start, why, raw) => {
      const text = raw.trim();
      if (!text) return;
      findings.push({ file, line: lineAt(start), text, bucket, why });
    });
  }
  demoteRepeatedData(findings);
  const counts = { UI_STRING: 0, NON_UI: 0, ALREADY_TRANSLATED: 0 };
  for (const f of findings) counts[f.bucket]++;
  return { file, counts, findings };
}

function demoteRepeatedData(findings) {
  const counts = new Map();
  for (const f of findings) {
    if (f.bucket !== "UI_STRING") continue;
    counts.set(f.text, (counts.get(f.text) ?? 0) + 1);
  }
  for (const f of findings) {
    if (f.bucket !== "UI_STRING") continue;
    if ((counts.get(f.text) ?? 0) <= REPEATED_DATA_LIMIT) continue;
    f.bucket = "NON_UI";
    f.why = `${f.why}+repeated-data`;
  }
}

function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(full, ext, out);
    } else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

export function collectFiles(root, filter) {
  const files = [];
  for (const target of SCAN_TARGETS) {
    const full = join(root, target);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, ".ts", files);
    else files.push(full);
  }
  const rel = files
    .map((f) => relative(root, f).split(sep).join("/"))
    .filter((f) => (filter ? f.includes(filter) : true))
    .sort();
  return { root, rel };
}

export function runAudit(root, filter) {
  const { root: base, rel } = collectFiles(root, filter);
  const perFile = [];
  const offenders = [];
  const totals = { UI_STRING: 0, NON_UI: 0, ALREADY_TRANSLATED: 0 };
  for (const file of rel) {
    const src = readFileSync(join(base, file), "utf8");
    const result = classifySource(src, { file, html: file.endsWith(".html") });
    for (const key of BUCKETS) totals[key] += result.counts[key];
    perFile.push({ file, counts: result.counts });
    for (const f of result.findings) {
      if (f.bucket === "UI_STRING") offenders.push({ file, line: f.line, text: f.text });
    }
  }
  perFile.sort((a, b) => b.counts.UI_STRING - a.counts.UI_STRING || (a.file < b.file ? -1 : 1));
  offenders.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return {
    totals,
    files: perFile,
    offenders,
    translationCallees: TRANSLATION_CALLEES,
    scannedFiles: rel.length,
  };
}

const CALL_OPEN = new RegExp(
  `(?:^|[^\\w.])(?:${TRANSLATION_CALLEES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*\\(`,
  "g",
);
const DATA_I18N_ATTR = /data-i18n(?:-[a-z-]+)?=(["'])([\s\S]*?)\1/g;
const ESCAPES = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  times: "×",
};

function unescapeLiteral(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (match, body) => {
    if (body[0] === "u" && body[1] === "{") return String.fromCodePoint(parseInt(body.slice(2, -1), 16));
    if (body[0] === "u" || body[0] === "x") return String.fromCharCode(parseInt(body.slice(1), 16));
    return ESCAPES[body] ?? body;
  });
}

function decodeMarkupEntities(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
    return NAMED_ENTITIES[lower] ?? match;
  });
}

function leadingQuoted(src) {
  const quote = src[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  const close = skipString(src, 0);
  return close >= src.length ? null : unescapeLiteral(src.slice(1, close));
}

function isQuoted(text) {
  const quote = text[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") return false;
  return skipString(text, 0) === text.length - 1;
}


function skipString(src, open) {
  const quote = src[open];
  for (let i = open + 1; i < src.length; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src[i] === quote) return i;
  }
  return src.length;
}

function skipRegex(src, open) {
  for (let i = open + 1; i < src.length; i++) {
    if (src[i] === "\\") {
      i++;
      continue;
    }
    if (src[i] === "[") {
      while (i < src.length && src[i] !== "]") i += src[i] === "\\" ? 2 : 1;
      continue;
    }
    if (src[i] === "/") return i;
    if (src[i] === "\n") return -1;
  }
  return -1;
}

function regexStart(src, open) {
  for (let i = open - 1; i >= 0; i--) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;
    return "(,=:[!&|?{};+-*%~^<>".includes(ch);
  }
  return true;
}

function skipNonCode(src, i) {
  const ch = src[i];
  if (ch === '"' || ch === "'" || ch === "`") return skipString(src, i);
  if (ch === "/" && regexStart(src, i)) {
    const close = skipRegex(src, i);
    if (close !== -1) return close;
  }
  return -1;
}


function enclosedBody(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const skipped = skipNonCode(src, i);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

function splitTopLevel(text, chars) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const skipped = skipNonCode(text, i);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && chars.includes(ch)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const CONST_DECL = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]*)?=\s*/g;
const OBJECT_MEMBER =
  /(?:^|[{,]\s*)(?:([A-Za-z_$][\w$]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*'))\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const IDENTIFIER_PATH = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*$/;

function resolveImportPath(file, specifier) {
  if (!specifier.startsWith(".")) return "";
  const baseParts = file.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join("/").replace(/\.js$/, ".ts");
}

export function moduleConstants(src) {
  const values = new Map();
  for (const match of src.matchAll(CONST_DECL)) {
    const name = match[1];
    const rest = src.slice(match.index + match[0].length);
    const direct = leadingQuoted(rest);
    if (direct !== null && !direct.includes("${")) {
      values.set(name, direct);
      continue;
    }
    if (rest[0] !== "{") continue;
    const open = match.index + match[0].length;
    const body = enclosedBody(src, open - 1);
    if (body === null) continue;
    for (const member of body.matchAll(OBJECT_MEMBER)) {
      const property = member[1] ?? unescapeLiteral((member[2] ?? member[3]).slice(1, -1));
      values.set(`${name}.${property}`, unescapeLiteral(member[4] ?? member[5]));
    }
  }
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const match of src.matchAll(CONST_DECL)) {
      if (values.has(match[1])) continue;
      const bound = /^\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/.exec(
        src.slice(match.index + match[0].length),
      )?.[1]?.replace(/\s+/g, "");
      if (bound === undefined) continue;
      const resolved = values.get(bound);
      if (resolved === undefined) continue;
      values.set(match[1], resolved);
      progressed = true;
    }
  }
  return values;
}

function topLevelIndex(text, chars) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const skipped = skipNonCode(text, i);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (depth === 0 && chars.includes(ch)) return i;
  }
  return -1;
}

function keysOf(entry) {
  return entry.keys ?? (entry.key === undefined ? undefined : [entry.key]);
}

function ternaryKeys(text, constants, resolveExternal) {
  const question = topLevelIndex(text, "?");
  if (question === -1) return null;
  const tail = text.slice(question + 1);
  const colon = topLevelIndex(tail, ":");
  if (colon === -1) return { unresolved: true };
  const branches = [
    keysOf(staticKey(tail.slice(0, colon), constants, resolveExternal)),
    keysOf(staticKey(tail.slice(colon + 1), constants, resolveExternal)),
  ];
  if (branches.some((entry) => entry === undefined)) return { unresolved: true };
  return { keys: branches.flat() };
}

function staticKey(expression, constants, resolveExternal) {
  const text = expression.trim();
  if (text === "") return { unresolved: true };
  if (isQuoted(text)) return text.includes("${") ? { unresolved: true } : { key: leadingQuoted(text) };
  const ternary = ternaryKeys(text, constants, resolveExternal);
  if (ternary !== null) return ternary;
  const plus = topLevelIndex(text, "+");
  if (plus !== -1) {
    const parts = [
      keysOf(staticKey(text.slice(0, plus), constants, resolveExternal)),
      keysOf(staticKey(text.slice(plus + 1), constants, resolveExternal)),
    ];
    if (parts.some((entry) => entry === undefined)) return { unresolved: true };
    return { key: parts.flat().join("") };
  }
  if (IDENTIFIER_PATH.test(text)) {
    const bound = constants.get(text) ?? resolveExternal?.(text);
    return bound === undefined ? { unresolved: true } : { key: bound };
  }
  return { unresolved: true };
}

export function collectCallSites(src, html = false, resolveExternal) {
  const keys = new Set();
  const dynamic = [];
  const constants = moduleConstants(src);
  for (const match of src.matchAll(CALL_OPEN)) {
    const open = match.index + match[0].length - 1;
    const argument = enclosedBody(src, open);
    if (argument === null) continue;
    const [first] = splitTopLevel(argument, ",");
    const resolved = keysOf(staticKey(first, constants, resolveExternal));
    if (resolved === undefined) {
      const line = src.slice(0, open).split("\n").length;
      dynamic.push({ line, text: `${match[0].trim()}${first.trim()})` });
      continue;
    }
    for (const key of resolved) keys.add(key);
  }
  if (html) for (const match of src.matchAll(DATA_I18N_ATTR)) keys.add(decodeMarkupEntities(match[2]));
  return { keys, dynamic };
}

export function collectCallSiteKeys(src, html = false) {
  return collectCallSites(src, html).keys;
}

export const LABEL_TABLE_SUFFIXES = [
  "LABELS",
  "LABEL",
  "ICONS",
  "NAMES",
  "STATUSES",
  "TITLES",
  "KINDS",
  "ROLES",
  "CATEGORIES",
  "MODES",
  "STATES",
  "TAGS",
  "BADGES",
  "META",
  "TABS",
  "VERBS",
  "labels",
  "label",
  "names",
  "name",
  "titles",
  "title",
  "groups",
  "kinds",
  "roles",
  "statuses",
  "modes",
  "states",
  "templates",
  "verbs",
  "actions",
  "icons",
  "tones",
  "hints",
  "meta",
  "tabs",
];

export function isLabelTableName(name) {
  return LABEL_TABLE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

const TABLE_DECL = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][\w$]*)\s*(?::[^=\n]*)?=\s*([[{[])/g;

const CALLEE_ALT = TRANSLATION_CALLEES.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

function balancedBody(src, open) {
  const openCh = src[open];
  const closeCh = openCh === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return "";
}

const LABEL_PROPERTIES = new Set(["label", "name", "title", "text", "note", "ariaLabel", "description", "hosts"]);

function tableStrings(body) {
  const byProperty = new Map();
  for (const match of body.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    const value = unescapeLiteral(match[1] ?? match[2]);
    if (!/[A-Za-z]{2}/.test(value)) continue;
    if (/^\s*:/.test(body.slice(match.index + match[0].length))) continue;
    const property = /(?:^|[{,]\s*)([A-Za-z_][\w$]*)\s*:\s*$/.exec(body.slice(0, match.index));
    const key = property ? property[1] : "";
    if (!byProperty.has(key)) byProperty.set(key, new Set());
    byProperty.get(key).add(value);
  }
  const labelled = [...byProperty.keys()].filter((key) => LABEL_PROPERTIES.has(key));
  const chosen = labelled.length > 0 ? labelled : [...byProperty.keys()];
  const out = new Set();
  for (const key of chosen) for (const value of byProperty.get(key)) out.add(value);
  return [...out];
}

function feedsTranslationIn(src, name) {
  const direct = new RegExp(`(?:^|[^\\w$.])(?:${CALLEE_ALT})\\s*\\(\\s*${name}\\s*[\\[:.]`);
  if (direct.test(src)) return true;
  const iterated = new RegExp(
    `${name}\\s*\\.\\s*(?:map|filter|find|forEach)\\s*\\(\\s*\\(?\\s*([A-Za-z_][\\w$]*)`,
    "g",
  );
  const params = new Set([...src.matchAll(iterated)].map((m) => m[1]));
  if (params.size === 0) return false;
  const indirect = new RegExp(`(?:^|[^\\w$.])(?:${CALLEE_ALT})\\s*\\(\\s*([A-Za-z_][\\w$]*)\\s*[\\[:.]`, "g");
  for (const use of src.matchAll(indirect)) {
    if (params.has(use[1])) return true;
  }
  return false;
}

function importsName(src, name) {
  for (const match of src.matchAll(/import\s+([^;]*?)\s+from\s+["'][^"']+["']/g)) {
    const clause = match[1];
    const braced = /\{([^}]*)\}/.exec(clause);
    if (!braced) continue;
    for (const part of braced[1].split(",")) {
      const local = part.split(/\s+as\s+/).pop()?.trim();
      if (local === name) return true;
    }
  }
  return false;
}

export function collectTranslatedTableKeys(sources) {
  const tables = new Map();
  for (const { file, src } of sources) {
    for (const match of src.matchAll(TABLE_DECL)) {
      const name = match[1];
      if (!isLabelTableName(name)) continue;
      const open = match.index + match[0].length - 1;
      const values = tableStrings(balancedBody(src, open));
      if (values.length === 0) continue;
      const feeds =
        feedsTranslationIn(src, name) || sources.some((o) => o.file !== file && importsName(o.src, name) && feedsTranslationIn(o.src, name));
      if (!feeds) continue;
      const entry = tables.get(name) ?? { name, file, values: new Set() };
      for (const value of values) entry.values.add(value);
      tables.set(name, entry);
    }
  }
  return [...tables.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

export function placeholdersOf(text) {
  return [...text.matchAll(/\{([^{}]*)\}/g)]
    .map((m) => m[1])
    .sort();
}

export function placeholderMismatch(key, value) {
  const inKey = placeholdersOf(key);
  const inValue = placeholdersOf(value);
  if (inKey.length === inValue.length && inKey.every((name, i) => name === inValue[i])) return null;
  return {
    missing: inKey.filter((name) => !inValue.includes(name)),
    extra: inValue.filter((name) => !inKey.includes(name)),
  };
}

export function isIdentityMapping(key, value, exempt) {
  if (key !== value) return false;
  if (!/[A-Za-z]{2}/.test(key)) return false;
  return !Object.hasOwn(exempt, key);
}

export function isFragmentKey(key) {
  if (key === key.trim()) return false;
  return /[A-Za-z]{2}/.test(key);
}

export async function loadExemptions() {
  const mod = await import(new URL("../plugins/chassis/src/locales/identity-exempt.ts", import.meta.url));
  return mod.IDENTITY_EXEMPT;
}

export async function runCatalogAudit(root, filter) {
  const { zhCN } = await import(new URL("../plugins/chassis/src/locales/zh-CN.ts", import.meta.url));
  const exempt = await loadExemptions();
  const { root: base, rel } = collectFiles(root, filter);
  const sources = rel.map((file) => ({ file, src: readFileSync(join(base, file), "utf8") }));
  const constantsByFile = new Map(sources.map(({ file, src }) => [file, moduleConstants(src)]));
  const importedFrom = new Map();
  for (const { file, src } of sources) {
    for (const match of src.matchAll(NAMED_IMPORT)) {
      const target = resolveImportPath(file, match[2]);
      for (const part of match[1].split(",")) {
        const [original, local = original] = part.split(/\s+as\s+/).map((piece) => piece.trim());
        if (!original || !local) continue;
        importedFrom.set(`${file}|${local}`, `${target}|${original}`);
      }
    }
  }
  const resolveInFile = (file, name, seen) => {
    const direct = constantsByFile.get(file)?.get(name);
    if (direct !== undefined) return direct;
    const binding = importedFrom.get(`${file}|${name.split(".")[0]}`);
    if (binding === undefined || seen.has(binding)) return undefined;
    const [targetFile, targetName] = binding.split("|");
    const rest = name.split(".").slice(1);
    if (targetFile === undefined || targetName === undefined) return undefined;
    seen.add(binding);
    const resolved = resolveInFile(targetFile, [targetName, ...rest].join("."), seen);
    seen.delete(binding);
    return resolved;
  };
  const misses = [];
  const dynamic = [];
  for (const { file, src } of sources) {
    const found = collectCallSites(src, file.endsWith(".html"), (name) => resolveInFile(file, name, new Set()));
    for (const key of found.keys) {
      if (key === "" || !/[A-Za-z]{2}/.test(key)) continue;
      if (zhCN[key] === undefined) misses.push({ file, key });
    }
    for (const site of found.dynamic) dynamic.push({ file, ...site });
  }
  const tables = collectTranslatedTableKeys(sources);
  const dynamicMisses = [];
  for (const table of tables) {
    for (const key of [...table.values].sort()) {
      if (zhCN[key] === undefined) dynamicMisses.push({ file: table.file, table: table.name, key });
    }
  }
  const identity = [];
  const placeholderMismatches = [];
  const fragments = [];
  for (const key of Object.keys(zhCN)) {
    const value = zhCN[key];
    if (isIdentityMapping(key, value, exempt)) identity.push({ key });
    const mismatch = placeholderMismatch(key, value);
    if (mismatch) placeholderMismatches.push({ key, ...mismatch });
    if (isFragmentKey(key)) fragments.push({ key });
  }
  const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  misses.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : byKey(a, b)));
  dynamicMisses.sort((a, b) => byKey(a, b));
  identity.sort(byKey);
  placeholderMismatches.sort(byKey);
  fragments.sort(byKey);
  const staleExemptions = Object.keys(exempt).filter((key) => zhCN[key] === undefined);
  return {
    misses,
    dynamic,
    dynamicMisses,
    tables: tables.map((t) => ({ name: t.name, file: t.file, values: t.values.size })),
    identity,
    placeholderMismatches,
    fragments,
    staleExemptions: staleExemptions.sort(),
  };
}

function printSummary(report, catalog) {
  const lines = [];
  lines.push(`i18n audit: ${report.scannedFiles} files scanned`);
  lines.push(
    `  UI_STRING ${report.totals.UI_STRING}   ALREADY_TRANSLATED ${report.totals.ALREADY_TRANSLATED}   NON_UI ${report.totals.NON_UI}`,
  );
  lines.push("");
  lines.push("  files with untranslated strings (UI_STRING, already translated, path):");
  for (const entry of report.files) {
    if (entry.counts.UI_STRING === 0 && entry.counts.ALREADY_TRANSLATED === 0) continue;
    lines.push(
      `    ${String(entry.counts.UI_STRING).padStart(5)}  ${String(entry.counts.ALREADY_TRANSLATED).padStart(5)}  ${entry.file}`,
    );
  }
  lines.push("");
  lines.push("  worst 10 files by UI_STRING:");
  for (const entry of report.files.filter((f) => f.counts.UI_STRING > 0).slice(0, 10)) {
    lines.push(`    ${String(entry.counts.UI_STRING).padStart(5)}  ${entry.file}`);
  }
  lines.push("");
  lines.push(`  translation keys with no zh-CN entry: ${catalog.misses.length}`);
  for (const miss of catalog.misses) lines.push(`    ${miss.file}  ${JSON.stringify(miss.key)}`);
  lines.push("");
  lines.push(`  label tables feeding t(): ${catalog.tables.length}`);
  for (const table of catalog.tables) lines.push(`    ${table.file}  ${table.name} (${table.values})`);
  lines.push("");
  lines.push(`  label-table keys with no zh-CN entry: ${catalog.dynamicMisses.length}`);
  for (const miss of catalog.dynamicMisses)
    lines.push(`    ${miss.file}  ${miss.table}  ${JSON.stringify(miss.key)}`);
  lines.push("");
  lines.push(`  translation calls with keys not statically resolvable: ${catalog.dynamic.length}`);
  for (const site of catalog.dynamic) lines.push(`    ${site.file}:${site.line}  ${site.text}`);
  lines.push("");
  lines.push(`  untranslated identity mappings (value === key, not exempt): ${catalog.identity.length}`);
  for (const entry of catalog.identity) lines.push(`    ${JSON.stringify(entry.key)}`);
  lines.push("");
  lines.push(`  placeholder mismatches (key vs value): ${catalog.placeholderMismatches.length}`);
  for (const entry of catalog.placeholderMismatches)
    lines.push(`    ${JSON.stringify(entry.key)}  missing ${JSON.stringify(entry.missing)}  extra ${JSON.stringify(entry.extra)}`);
  lines.push("");
  lines.push(`  fragment keys with leading/trailing whitespace: ${catalog.fragments.length}`);
  for (const entry of catalog.fragments) lines.push(`    ${JSON.stringify(entry.key)}`);
  lines.push("");
  lines.push(`  exemptions no longer matching a catalog entry: ${catalog.staleExemptions.length}`);
  for (const key of catalog.staleExemptions) lines.push(`    ${JSON.stringify(key)}`);
  lines.push("");
  lines.push(`  treated as translation calls: ${TRANSLATION_CALLEES.join(", ")}`);
  process.stdout.write(lines.join("\n") + "\n");
}

function failOn(flag, actual, label) {
  if (flag === undefined) return false;
  const bound = Number(flag);
  if (!Number.isFinite(bound)) {
    process.stderr.write(`${flag} must be a number, got ${flag}\n`);
    process.exit(2);
  }
  if (actual <= bound) return false;
  process.stderr.write(`${label} ${actual} exceed ${flag} ${bound}\n`);
  return true;
}

const GATES = [
  ["fail-on", (r) => r.totals.UI_STRING, "UI_STRING"],
  ["fail-on-missing", (r, c) => c.misses.length, "catalog misses"],
  ["fail-on-table-missing", (r, c) => c.dynamicMisses.length, "label-table misses"],
  ["fail-on-identity", (r, c) => c.identity.length, "untranslated identity mappings"],
  ["fail-on-placeholder", (r, c) => c.placeholderMismatches.length, "placeholder mismatches"],
  ["fail-on-fragment", (r, c) => c.fragments.length, "fragment keys"],
  ["fail-on-dynamic", (r, c) => c.dynamic.length, "unresolvable dynamic keys"],
];

const invoked = process.argv[1] ? pathToFileUrl(process.argv[1]) : "";
if (invoked === import.meta.url) {
  const { values } = parseArgs({
    options: {
      json: { type: "boolean", default: false },
      file: { type: "string" },
      root: { type: "string" },
      ...Object.fromEntries(GATES.map(([flag]) => [flag, { type: "string" }])),
    },
  });
  const root = values.root ?? process.cwd();
  const report = runAudit(root, values.file);
  const catalog = await runCatalogAudit(root, values.file);
  if (values.json)
    process.stdout.write(
      JSON.stringify(
        {
          ...report,
          catalogMisses: catalog.misses,
          tableMisses: catalog.dynamicMisses,
          dynamicKeys: catalog.dynamic,
          labelTables: catalog.tables,
          identityMappings: catalog.identity,
          placeholderMismatches: catalog.placeholderMismatches,
          fragmentKeys: catalog.fragments,
          staleExemptions: catalog.staleExemptions,
        },
        null,
        2,
      ) + "\n",
    );
  else printSummary(report, catalog);
  let failed = false;
  for (const [flag, read, label] of GATES) failed = failOn(values[flag], read(report, catalog), label) || failed;
  if (failed) process.exit(1);
}

function pathToFileUrl(p) {
  const abs = p.startsWith("/") ? p : `/${p.replace(/\\/g, "/")}`;
  return new URL(abs, "file:///").href;
}
