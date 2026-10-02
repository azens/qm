import { t } from "../../chassis/src/i18n-lit.ts";

export const COMPOSIO_UNAVAILABLE_CODES = ["composio_not_enabled", "composio_upstream_failed"] as const;
export type ComposioUnavailableCode = (typeof COMPOSIO_UNAVAILABLE_CODES)[number];

const COMPOSIO_UNAVAILABLE_COPY: Record<ComposioUnavailableCode, string> = {
  composio_not_enabled:
    "App connections aren’t available for your account yet. Ask your administrator to enable them.",
  composio_upstream_failed: "Could not load apps. Please try again.",
};

export function composioUnavailableCode(payload: unknown): ComposioUnavailableCode | null {
  if (!payload || typeof payload !== "object" || !("unavailable_code" in payload)) return null;
  const code = payload.unavailable_code;
  if (typeof code !== "string") return null;
  return (COMPOSIO_UNAVAILABLE_CODES as readonly string[]).includes(code) ? (code as ComposioUnavailableCode) : null;
}

export function composioUnavailableMessage(payload: unknown): string | null {
  const code = composioUnavailableCode(payload);
  return code ? t(COMPOSIO_UNAVAILABLE_COPY[code]) : null;
}
