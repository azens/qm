import { t } from "../../chassis/src/i18n-lit.ts";
import { openDesktopBrowser } from "../../chassis/src/desktop-browser.ts";
import { SettingState, settingRegistry } from "./setting-state.ts";
export type Api = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ ok: boolean; status?: number; data?: any }>;
export type Context = {
  api: Api;
  orgScope: () => string;
  connectorName: (id: string) => string;
  fmtTime: (value: string) => string;
};
export let context: Context;
export function configure(value: Context) {
  context = value;
}
export class SlackSetting extends SettingState {
  scope = "";
  collect() {
    if (this.key === "internal-member-overrides")
      return {
        members: [
          ...new Set(
            String(this.draft.text || "")
              .split(/[\n,]/)
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean),
          ),
        ],
      };
    if (this.key === "ack-emoji") return { names: [...(this.draft.names || [])] };
    return { on: !!this.draft.on };
  }
  change(value: any) {
    this.draft = { ...this.draft, ...value };
    this.changed();
  }
  load(value: any, scope: string, available: boolean) {
    this.scope = scope;
    this.available = available;
    this.draft = { on: !!value };
    if (this.key === "internal-member-overrides") this.draft = { text: (value || []).join("\n") };
    if (this.key === "ack-emoji") this.draft = { names: [...(value || [])] };
    this.baseline = JSON.stringify(this.collect());
    this.message = "";
    this.tone = "";
    this.saving = false;
    this.render();
  }
}
export const states = new Map(
  ["external-slack-participants", "internal-member-overrides", "channel-header-pin-default", "ack-emoji"].map((key) => [
    key,
    new SlackSetting(key),
  ]),
);
export const { owns, collect, capture, commit, status, statusKey } = settingRegistry(states);
export function loadScope(data: any, scope: string) {
  for (const [key, field] of Object.entries({
    "external-slack-participants": "externalSlackParticipants",
    "internal-member-overrides": "internalMemberOverrides",
    "channel-header-pin-default": "channelHeaderPinDefault",
    "ack-emoji": "ackEmoji",
  }))
    states.get(key)!.load(data[field], scope, scope.startsWith("org:") && field in data);
}
export type Connector = {
  provider: string;
  configured?: boolean;
  clientId?: string;
  enabled?: boolean;
  hasSecret?: boolean;
  updatedBy?: string;
  updatedAt?: string;
  inherited?: boolean;
  redirectPath?: string;
  scopes?: string[];
  setupGuide?: { url: string; console: string; steps: string[] };
};
export class ConnectorsState {
  catalog: Connector[] = [];
  list: Connector[] = [];
  editor = false;
  editing = "";
  draft = { provider: "", clientId: "", clientSecret: "", enabled: true };
  revision = 0;
  saving = false;
  message = "";
  tone = "";
  request = 0;
  render = () => {};
  get displayed(): Connector[] {
    return [
      ...this.list,
      ...this.catalog
        .filter((c) => c.configured && !this.list.some((e) => e.provider === c.provider))
        .map((c) => ({ provider: c.provider, inherited: true })),
    ];
  }
  change(field: string, value: string | boolean) {
    this.draft = { ...this.draft, [field]: value };
    this.revision++;
    this.render();
  }
  reset() {
    this.editor = false;
    this.editing = "";
    this.draft = { provider: this.catalog[0]?.provider || "", clientId: "", clientSecret: "", enabled: true };
    this.revision++;
    this.render();
  }
  edit(connector?: Connector) {
    this.editing = connector && !connector.inherited ? connector.provider : "";
    this.draft = {
      provider: connector?.provider || this.catalog[0]?.provider || "",
      clientId: connector?.clientId || "",
      clientSecret: "",
      enabled: connector?.enabled !== false,
    };
    this.editor = true;
    this.revision++;
    this.render();
  }
  setStatus(message: string, tone: string) {
    this.message = message;
    this.tone = tone;
    this.render();
  }
  async load() {
    const request = ++this.request,
      scope = context.orgScope();
    const [catalog, result] = await Promise.all([
      context.api("GET", "/api/connector-catalog"),
      context.api("GET", "/api/scopes/" + encodeURIComponent(scope) + "?view=connectors"),
    ]);
    if (request !== this.request || scope !== context.orgScope()) return;
    if (!catalog.ok) return this.setStatus(catalog.data?.message || t("Failed to load connector setup."), "err");
    this.catalog = catalog.data.catalog || [];
    if (!result.ok)
      return this.setStatus(
        result.status === 403 ? t("Only an org admin can manage connectors.") : result.data?.message || t("Failed to load."),
        "err",
      );
    this.list = result.data.connectors || [];
    if (!this.editor) this.draft.provider = this.catalog[0]?.provider || "";
    this.render();
  }
  async save() {
    if (this.saving) return;
    const body = { ...this.draft, clientId: this.draft.clientId.trim() };
    if (!body.provider) return this.setStatus(t("Choose a connector."), "err");
    if (!body.clientId) return this.setStatus(t("Client ID is required."), "err");
    if (!body.clientSecret) return this.setStatus(t("Client secret is required."), "err");
    const revision = this.revision,
      scope = context.orgScope();
    this.saving = true;
    this.setStatus(t("Saving..."), "saving");
    try {
      const result = await context.api("PUT", "/api/scopes/" + encodeURIComponent(scope) + "/connectors", body);
      if (scope !== context.orgScope()) return;
      if (!result.ok)
        return this.setStatus(
          result.status === 403 ? t("Only an org admin can manage connectors.") : result.data?.message || t("Save failed."),
          "err",
        );
      if (revision === this.revision) this.reset();
      await this.load();
      this.setStatus(revision + 1 === this.revision ? t("Saved") : t("Saved. Your newer edits are not saved."), "ok");
    } catch {
      this.setStatus(t("Save failed. Please try again."), "err");
    } finally {
      this.saving = false;
      this.render();
    }
  }
  async remove(provider: string) {
    if (
      !confirm(
        t("Delete the OAuth client for {name}? This hides the connector in everyone's web UI; existing links stop working.", {
          name: context.connectorName(provider),
        }),
      )
    )
      return;
    const scope = context.orgScope(),
      revision = this.revision;
    const result = await context.api("PUT", "/api/scopes/" + encodeURIComponent(scope) + "/connectors", {
      provider,
      delete: true,
    });
    if (scope !== context.orgScope()) return;
    if (!result.ok) return this.setStatus(result.data?.message || t("Delete failed."), "err");
    if (revision === this.revision && this.editing === provider) this.reset();
    await this.load();
    this.setStatus(t("Deleted"), "ok");
  }
}
export const connectors = new ConnectorsState();
export class SlackInstallationState {
  data: Record<string, any> = {};
  editor = false;
  guide = false;
  botToken = "";
  appToken = "";
  revision = 0;
  busy = "";
  message = "";
  tone = "";
  request = 0;
  linkStarted = false;
  render = () => {};
  setStatus(message: string, tone: string) {
    this.message = message;
    this.tone = tone;
    this.render();
  }
  async load() {
    const request = ++this.request;
    const result = await context.api("GET", "/api/slack-installation");
    if (request !== this.request) return;
    if (!result.ok) return this.setStatus(result.data?.message || t("Failed to load Slack status."), "err");
    this.data = result.data;
    const params = new URLSearchParams(location.search),
      step = params.get("slack");
    if ((!this.data.installAvailable && !this.data.configured) || params.get("setup") === "slack") this.guide = true;
    this.render();
    if (params.get("setup") === "slack")
      document.getElementById("card-slack-installation")?.scrollIntoView({ block: "start" });
    if (!this.linkStarted && this.data.installAvailable && ["setup", "install"].includes(step || "")) {
      this.linkStarted = true;
      if (this.data.configured && !(this.data.source === "service" && this.data.setup?.connected === false))
        this.setStatus(t("Slack is already configured. Return to your conversation."), "ok");
      else await this.start(step!);
    }
    if (step === "connected" && this.data.configured && this.data.setup?.connected)
      this.setStatus(t("Connected. You can return to your QM conversation."), "ok");
  }
  async start(step = "install") {
    if (this.busy) return;
    this.busy = "start";
    this.render();
    try {
      const browser = new URL(location.href);
      browser.searchParams.set("slack", step);
      if (await openDesktopBrowser(browser.href)) return;
      const result = await context.api("POST", "/api/slack-installation/start", { step });
      if (result.ok && result.data.url) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = result.data.url;
        document.body.appendChild(form);
        form.submit();
      } else this.setStatus(t("Could not start Slack installation. Please try again."), "err");
    } catch {
      this.setStatus(t("Could not start Slack installation. Please try again."), "err");
    } finally {
      this.busy = "";
      this.render();
    }
  }
  async save() {
    if (this.busy) return;
    const botToken = this.botToken.trim(),
      appToken = this.appToken.trim(),
      revision = this.revision;
    if (!botToken || !appToken) return this.setStatus(t("Both Slack tokens are required."), "err");
    this.busy = "save";
    this.setStatus(t("Validating with Slack…"), "saving");
    try {
      const result = await context.api("PUT", "/api/slack-installation", { botToken, appToken });
      if (!result.ok) return this.setStatus(result.data?.message || t("Slack validation failed."), "err");
      if (revision === this.revision) {
        this.botToken = "";
        this.appToken = "";
        this.editor = false;
      }
      await this.load();
      this.setStatus(t("Tokens verified and saved. Allow a few seconds, then test a mention and DM in Slack."), "ok");
    } catch {
      this.setStatus(t("Slack validation failed. Please try again."), "err");
    } finally {
      this.busy = "";
      this.render();
    }
  }
  async remove() {
    if (
      this.busy ||
      !confirm(
        t("Disconnect this Slack app? QM will stop replying in Slack until you reconnect. The app will remain installed in your workspace."),
      )
    )
      return;
    this.busy = "remove";
    this.render();
    try {
      const result = await context.api("DELETE", "/api/slack-installation");
      if (!result.ok) return this.setStatus(result.data?.message || t("Remove failed."), "err");
      await this.load();
      this.setStatus(t("Slack disconnected."), "ok");
    } finally {
      this.busy = "";
      this.render();
    }
  }
}
export const installation = new SlackInstallationState();
export const emoji = {
  open: false,
  query: "",
  catalog: {} as Record<string, string>,
  standard: [] as string[][],
  loaded: false,
  error: "",
  async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const result = await context.api("GET", "/api/slack-emoji");
      if (result.ok) {
        this.catalog = result.data.emoji || {};
        this.standard = result.data.standard || [];
      } else
        this.error =
          result.status === 404
            ? t("Slack isn't connected on this deployment, so no emoji can be listed. Set SLACK_BOT_TOKEN on the core service (or complete the Slack installation on this page); on deployments where the token lives with the Slack plugin, the catalog appears after the plugin next starts and publishes it.")
            : t("Couldn't load emoji from Slack{reason}. Check the bot token and try again.", {
                reason: result.data?.message ? " (" + result.data.message + ")" : "",
              });
    } catch {
      this.error = t("Couldn't reach the server to load emoji. Reload and try again.");
    }
    states.get("ack-emoji")!.render();
  },
};
