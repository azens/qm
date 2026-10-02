import { en } from "./locales/en.ts";
import { zhCN } from "./locales/zh-CN.ts";

export type LocaleCatalog = Record<string, string>;
export type LocaleVars = Record<string, string | number>;
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "qm_locale";
export const LOCALE_META = "qm-locale";
export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Readonly<Record<string, string>> = {
  en: "English",
  "zh-CN": "简体中文",
};

const CATALOGS: Readonly<Record<string, LocaleCatalog>> = {
  en,
  "zh-CN": zhCN,
};

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
const STORAGE_KEY = "qm.locale";
const PLACEHOLDER = /\{(\w+)\}/g;
const HTML_LANG_ATTR = /(<html\b[^>]*\slang=")[^"]*(")/i;
const HTML_LANG_MISSING = /<html\b/i;
const META_TAG = new RegExp(`<meta name="${LOCALE_META}" content="[^"]*"\\s*/?>`, "i");

const browserGlobal = (): Record<string, unknown> => globalThis as unknown as Record<string, unknown>;

export function availableLocales(): readonly string[] {
  return SUPPORTED_LOCALES;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, "-");
}

export function matchSupportedLocale(tag: string | null | undefined): Locale | null {
  if (typeof tag !== "string") return null;
  const wanted = normalizeTag(tag);
  if (!wanted || wanted === "*") return null;
  const subtags = wanted.split("-");
  for (let end = subtags.length; end > 0; end -= 1) {
    const candidate = subtags.slice(0, end).join("-");
    for (const locale of SUPPORTED_LOCALES) {
      if (normalizeTag(locale) === candidate) return locale;
    }
    for (const locale of SUPPORTED_LOCALES) {
      if (normalizeTag(locale).startsWith(`${candidate}-`)) return locale;
    }
  }
  return null;
}

interface RankedTag {
  tag: string;
  quality: number;
  order: number;
}

export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (typeof acceptLanguage !== "string" || acceptLanguage.trim() === "") return DEFAULT_LOCALE;
  const ranked: RankedTag[] = [];
  acceptLanguage.split(",").forEach((part, order) => {
    const [rawTag, ...params] = part.split(";");
    const tag = normalizeTag(rawTag ?? "");
    if (!tag || tag === "*") return;
    let quality = 1;
    for (const param of params) {
      const [name, value] = param.split("=");
      if (normalizeTag(name ?? "") !== "q") continue;
      const parsed = Number.parseFloat((value ?? "").trim());
      if (Number.isFinite(parsed)) quality = parsed;
    }
    if (quality <= 0) return;
    ranked.push({ tag, quality, order });
  });
  ranked.sort((a, b) => b.quality - a.quality || a.order - b.order);
  for (const { tag } of ranked) {
    const match = matchSupportedLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

function readCookie(name: string): string | null {
  try {
    const jar = (browserGlobal().document as { cookie?: unknown } | undefined)?.cookie;
    if (typeof jar !== "string") return null;
    for (const part of jar.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() !== name) continue;
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    }
  } catch {
    return null;
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  try {
    const doc = browserGlobal().document as { cookie?: unknown } | undefined;
    if (!doc || typeof doc.cookie !== "string") return;
    doc.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; SameSite=Lax`;
  } catch {
    return;
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readStorage(): string | null {
  try {
    const store = browserGlobal().localStorage as StorageLike | undefined;
    return store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    const store = browserGlobal().localStorage as StorageLike | undefined;
    store?.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

function readServerHint(): string | null {
  try {
    const doc = browserGlobal().document as
      { querySelector(selectors: string): { getAttribute(name: string): string | null } | null } | undefined;
    const hinted = doc?.querySelector(`meta[name="${LOCALE_META}"]`)?.getAttribute("content");
    if (typeof hinted === "string" && hinted.trim()) return hinted;
  } catch {
    return null;
  }
  return null;
}

function readNavigatorLanguage(): string | null {
  if (!browserGlobal().document) return null;
  const scope = browserGlobal();
  const windowNavigator = (scope.window as { navigator?: { language?: unknown } } | undefined)?.navigator;
  const navigator = windowNavigator ?? (scope.window === undefined ? scope.navigator : undefined);
  const language = (navigator as { language?: unknown } | undefined)?.language;
  return typeof language === "string" && language.trim() ? language : null;
}

function detectLocale(): Locale {
  return (
    matchSupportedLocale(readCookie(LOCALE_COOKIE)) ??
    matchSupportedLocale(readStorage()) ??
    matchSupportedLocale(readServerHint()) ??
    negotiateLocale(readNavigatorLanguage())
  );
}

function applyDocumentLanguage(locale: Locale): void {
  try {
    const doc = browserGlobal().document as { documentElement?: { lang?: unknown } | null } | undefined;
    const element = doc?.documentElement;
    if (element && typeof element === "object") element.lang = locale;
  } catch {
    return;
  }
}

let active: Locale | null = null;
let revision = 0;
const listeners = new Set<() => void>();

export function currentLocale(): Locale {
  if (active === null) {
    active = detectLocale();
    applyDocumentLanguage(active);
  }
  return active;
}

export function localeRevision(): number {
  return revision;
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLocale(locale: string): void {
  const next = matchSupportedLocale(locale) ?? DEFAULT_LOCALE;
  writeCookie(LOCALE_COOKIE, next);
  writeStorage(next);
  if (active === next) return;
  active = next;
  revision += 1;
  applyDocumentLanguage(next);
  for (const listener of listeners) listener();
}

function interpolate(template: string, vars?: LocaleVars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(key: string, vars?: LocaleVars): string {
  if (typeof key !== "string" || key === "") return "";
  const catalog = CATALOGS[currentLocale()] ?? {};
  const template = catalog[key] ?? CATALOGS[DEFAULT_LOCALE]?.[key] ?? key;
  return interpolate(template, vars);
}

function intlLocale(locale: string): string {
  return matchSupportedLocale(locale) ?? DEFAULT_LOCALE;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: string): string {
  const active = intlLocale(locale ?? currentLocale());
  try {
    return new Intl.NumberFormat(active, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const active = intlLocale(locale ?? currentLocale());
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(active, options).format(date);
  } catch {
    return date.toISOString();
  }
}

const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86400;

export function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const magnitude = Math.abs(seconds);
  if (magnitude < MINUTE_S) return translate("just now");
  if (magnitude < HOUR_S) {
    const minutes = Math.floor(magnitude / MINUTE_S);
    return seconds < 0 ? translate("{minutes}m ago", { minutes }) : translate("in {minutes}m", { minutes });
  }
  if (magnitude < DAY_S) {
    const hours = Math.floor(magnitude / HOUR_S);
    return seconds < 0 ? translate("{hours}h ago", { hours }) : translate("in {hours}h", { hours });
  }
  const days = Math.floor(magnitude / DAY_S);
  return seconds < 0 ? translate("{days}d ago", { days }) : translate("in {days}d", { days });
}

function pluralCategory(count: number, locale: string): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return "other";
  }
}

export function pluralize(count: number, forms: PluralForms, locale?: string): string {
  const active = intlLocale(locale ?? currentLocale());
  const category = pluralCategory(count, active);
  const template = forms[category] ?? forms.other ?? forms.one ?? String(count);
  return interpolate(template, { count });
}

export function localeFromRequest(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return matchSupportedLocale(cookieValue) ?? negotiateLocale(acceptLanguage);
}

export function injectLocale(html: string, locale: string): string {
  const resolved = matchSupportedLocale(locale) ?? DEFAULT_LOCALE;
  let out = html;
  if (HTML_LANG_ATTR.test(out)) {
    out = out.replace(HTML_LANG_ATTR, (_match, pre: string, post: string) => `${pre}${resolved}${post}`);
  } else if (HTML_LANG_MISSING.test(out)) {
    out = out.replace(HTML_LANG_MISSING, () => `<html lang="${resolved}"`);
  }
  const meta = `<meta name="${LOCALE_META}" content="${resolved}" />`;
  if (META_TAG.test(out)) out = out.replace(META_TAG, () => meta);
  else if (out.includes("</head>")) out = out.replace("</head>", () => `${meta}</head>`);
  return out;
}
