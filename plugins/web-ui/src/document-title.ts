import type { View } from "./shell-state";
import { t } from "../../chassis/src/i18n-lit.ts";

interface TitledSession {
  id: string;
  threadRef: string;
}

interface ActiveConversation {
  openingKey: string | null;
  sessionId: string | null;
  threadRef: string | null;
}

export const PRODUCT_TITLE = "QM · Web";

function viewTitle(view: View): string {
  const titles: Record<View, string> = {
    chats: t("Chats"),
    inbox: t("Inbox"),
    calendar: t("Calendar"),
    contexts: t("Projects"),
    crons: t("Crons"),
    loops: t("Loops"),
    webhooks: t("Webhooks"),
    files: t("Files"),
    keychain: t("Keychain"),
    deploys: t("Apps"),
    memory: t("Memory"),
    skills: t("Skills"),
    settings: t("Settings"),
  };
  return titles[view];
}

export function documentTitle(view?: View, conversationTitle?: string | null, conversationOpen = false): string {
  const title =
    view === "chats" && conversationOpen ? conversationTitle?.trim() || t("New chat") : view && viewTitle(view);
  return title ? `${title} · ${PRODUCT_TITLE}` : PRODUCT_TITLE;
}

export function updateDocumentTitle(view?: View, conversationTitle?: string | null, conversationOpen = false): void {
  document.title = documentTitle(view, conversationTitle, conversationOpen);
}

export function activeSessionForDocumentTitle<T extends TitledSession>(
  sessions: T[],
  active: ActiveConversation,
): T | undefined {
  if (active.openingKey) return sessions.find((session) => session.id === active.openingKey);
  return sessions.find(
    (session) => session.id === active.sessionId || (!active.sessionId && session.threadRef === active.threadRef),
  );
}
