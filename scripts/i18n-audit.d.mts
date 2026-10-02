export type I18nBucket = "UI_STRING" | "NON_UI" | "ALREADY_TRANSLATED";

export interface I18nFinding {
  file: string;
  line: number;
  text: string;
  bucket: I18nBucket;
  why: string;
}

export interface I18nFileReport {
  file: string;
  counts: Record<I18nBucket, number>;
}

export interface I18nAuditReport {
  totals: Record<I18nBucket, number>;
  files: I18nFileReport[];
  offenders: { file: string; line: number; text: string }[];
  translationCallees: string[];
  scannedFiles: number;
}

export interface LabelTable {
  name: string;
  file: string;
  values: Set<string>;
}

export interface CatalogMiss {
  file: string;
  key: string;
}

export interface TableMiss extends CatalogMiss {
  table: string;
}

export interface PlaceholderMismatch {
  key: string;
  missing: string[];
  extra: string[];
}

export interface DynamicCallSite {
  file: string;
  line: number;
  text: string;
}

export interface CatalogAuditReport {
  misses: CatalogMiss[];
  dynamic: DynamicCallSite[];
  dynamicMisses: TableMiss[];
  tables: { name: string; file: string; values: number }[];
  identity: { key: string }[];
  placeholderMismatches: PlaceholderMismatch[];
  fragments: { key: string }[];
  staleExemptions: string[];
}

export declare function collectCallSites(
  src: string,
  html?: boolean,
  resolveExternal?: (name: string) => string | undefined,
): { keys: Set<string>; dynamic: { line: number; text: string }[] };
export declare function moduleConstants(src: string): Map<string, string>;

export declare function collectCallSiteKeys(src: string, html?: boolean): Set<string>;
export declare function collectTranslatedTableKeys(sources: { file: string; src: string }[]): LabelTable[];
export declare function isLabelTableName(name: string): boolean;
export declare function placeholdersOf(text: string): string[];
export declare function placeholderMismatch(key: string, value: string): PlaceholderMismatch | null;
export declare function isIdentityMapping(
  key: string,
  value: string,
  exempt: Record<string, string>,
): boolean;
export declare function isFragmentKey(key: string): boolean;
export declare function loadExemptions(): Promise<Record<string, string>>;
export declare function runCatalogAudit(root: string, filter?: string): Promise<CatalogAuditReport>;
export declare const LABEL_TABLE_SUFFIXES: string[];
export declare function isTechnicalText(text: string): boolean;
export declare function classifySource(
  src: string,
  opts?: { file?: string; html?: boolean },
): { file: string; counts: Record<I18nBucket, number>; findings: I18nFinding[] };
export declare function collectFiles(root: string, filter?: string): { root: string; rel: string[] };
export declare function runAudit(root: string, filter?: string): I18nAuditReport;
export declare const SCAN_TARGETS: string[];
export declare const TRANSLATION_CALLEES: string[];
export declare const BUCKETS: I18nBucket[];
