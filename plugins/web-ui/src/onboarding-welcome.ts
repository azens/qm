import { openDesktopBrowser } from "../../chassis/src/desktop-browser";
import {
  isConnectionReturn,
  takeConnectionReturn,
  completeConnectionReturn,
  saveConnectionAttempt,
  clearConnectionAttempt,
  type ConnectionAttempt,
} from "./connection-return";
import { LitElement, html, nothing } from "lit";
import { Check } from "lucide";
import { icon } from "./ui";
import { mountConnectionPicker, type ConnectionService } from "./connection-picker";
import type { Me } from "./shell-state";
import "./onboarding-welcome.css";
import "./onboarding-slack";
import "./slack-account";
import {
  connectionPreviewEnabled,
  previewParameters,
  readPreviewAttempt,
  startPreviewAttempt,
  finishPreviewAttempt,
  verifyPreviewAttempt,
  previewConnections,
  savePreviewConnection,
  clearPreviewAttempt,
  resetPreview,
  type PreviewAttempt,
  type PickerState,
} from "./connection-preview";
import { LocaleController, t } from "../../chassis/src/i18n-lit.ts";
import { composioUnavailableMessage } from "./composio-errors.ts";

export class OnboardingWelcome extends LitElement {
  static properties = {
    me: { attribute: false },
    onMoreIdeas: { attribute: false },
    ideasDisabled: { type: Boolean },
    animateWelcome: { type: Boolean },
    setupOnly: { type: Boolean },
    widget: {},
    returnKey: {},
    base: {},
    adminBase: {},
    loading: { state: true },
    error: { state: true },
    authorizing: { state: true },
    authorizationError: { state: true },
    connectionOutcome: { state: true },
    connections: { state: true },
    connectionError: { state: true },
    workspaceConnected: { state: true },
    workspaceError: { state: true },
  };
  declare me: Me | null;
  declare onMoreIdeas: (() => void) | undefined;
  declare ideasDisabled: boolean;
  declare animateWelcome: boolean;
  declare setupOnly: boolean;
  declare widget: "all" | "apps" | "slack" | "slack-account";
  declare returnKey: string;
  declare base: string;
  declare adminBase: string;
  declare loading: boolean;
  declare error: string;
  declare authorizing: string;
  declare authorizationError: string;
  private connections: Array<{ id: string; toolkit: string }> = [];
  private connectionError = "";
  private workspaceConnected: boolean | null = null;
  private workspaceError = false;
  private realReturn: ConnectionAttempt | null = null;
  private connectionsController?: AbortController;
  private restoreScrollTop: number | null = null;
  private returnError = "";
  private returnAccount = "";
  private refreshConnections = () => {
    if (!document.hidden) void this.refreshWorkspace();
    if (!this.preview && !["slack", "slack-account"].includes(this.widget) && !document.hidden)
      void this.loadConnections();
  };
  private preview = connectionPreviewEnabled();
  private consent: PreviewAttempt | null = null;
  private returned: PreviewAttempt | null = null;
  private pickerState: PickerState = { query: "", expanded: false };
  private retryService: PreviewAttempt["service"] | null = null;
  declare connectionOutcome: "" | "checking" | "success" | "cancelled" | "failed" | "expired";
  private controller?: AbortController;
  private services: ConnectionService[] = [];

  constructor() {
    super();
    this.me = null;
    this.ideasDisabled = false;
    this.animateWelcome = true;
    this.setupOnly = false;
    this.widget = "all";
    this.returnKey = "welcome";
    this.base = "/";
    this.adminBase = "/admin";
    this.loading = true;
    this.error = "";
    this.authorizing = "";
    this.authorizationError = "";
    this.connectionOutcome = "";
    this.addController(this.locale);
  }
  private readonly locale = new LocaleController(this);
  protected createRenderRoot(): HTMLElement {
    return this;
  }
  private previewUser(): string {
    return `${this.me?.org}:${this.me?.user}`;
  }
  private async refreshWorkspace(): Promise<void> {
    if (this.widget === "apps" || (this.widget !== "slack-account" && this.me?.permissions?.includes("admin"))) return;
    try {
      const response = await fetch(`${this.base}api/composio/slack`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error(t("Slack status unavailable"));
      this.workspaceConnected = (await response.json()).workspaceInstalled === true;
      this.workspaceError = false;
    } catch {
      this.workspaceConnected = null;
      this.workspaceError = true;
    }
  }
  protected firstUpdated(): void {
    void this.refreshWorkspace();
    const params = previewParameters();
    const returnUrl =
      !this.preview && !["slack", "slack-account"].includes(this.widget)
        ? takeConnectionReturn(this.previewUser(), this.returnKey)
        : null;
    const realParams = returnUrl?.url.searchParams;
    const returning = !this.preview && isConnectionReturn();
    if (realParams) {
      const attempt = returnUrl!.attempt;
      this.realReturn = returnUrl!.verified ? null : attempt;
      this.returnError = realParams.get("error") ?? "";
      this.returnAccount = realParams.get("connectedAccountId") ?? "";
      if (attempt) {
        this.pickerState = { ...attempt.picker };
        this.restoreScrollTop = attempt.scrollTop;
        this.retryService = attempt.service;
        this.connectionOutcome = returnUrl!.verified ? "" : "checking";
      } else this.connectionOutcome = "expired";
      const clean = new URL(location.href);
      for (const key of ["composioReturn", "status", "error", "connectedAccountId"]) clean.searchParams.delete(key);
      history.replaceState(history.state, "", clean);
    }
    if (!this.preview) {
      window.addEventListener("focus", this.refreshConnections);
      document.addEventListener("visibilitychange", this.refreshConnections);
      if (!["slack", "slack-account"].includes(this.widget)) void this.loadConnections();
    }
    if (this.preview) {
      const visible = new URL(location.href);
      visible.searchParams.set("connectionDemo", "1");
      if (params.has("connectionConsent"))
        visible.searchParams.set("connectionConsent", params.get("connectionConsent")!);
      history.replaceState(history.state, "", visible);
    }
    const attempt = this.preview ? readPreviewAttempt(this.previewUser()) : null;
    if (this.preview && params.has("connectionConsent")) {
      this.consent = attempt?.state === params.get("connectionConsent") ? attempt : null;
      this.connectionOutcome = this.consent ? "" : "expired";
      this.requestUpdate();
      return;
    }
    if (this.preview && params.has("connectionReturn")) {
      if (attempt?.state === params.get("connectionReturn") && attempt.accountId === params.get("connectedAccountId")) {
        this.returned = attempt;
        this.retryService = attempt.service;
        this.pickerState = attempt.picker;
        this.connectionOutcome = "checking";
        window.setTimeout(() => {
          if (!this.isConnected) return;
          if (verifyPreviewAttempt(attempt)) {
            savePreviewConnection(attempt);
            this.connectionOutcome = "success";
          } else {
            this.connectionOutcome = params.get("error") === "access_denied" ? "cancelled" : "failed";
          }
          clearPreviewAttempt(attempt);
          this.drawPicker();
        }, 1000);
      } else this.connectionOutcome = "expired";
      const clean = new URL(location.href);
      for (const key of ["connectionReturn", "status", "error", "connectedAccountId"]) clean.searchParams.delete(key);
      history.replaceState(history.state, "", clean);
    } else if (
      !returning &&
      !this.setupOnly &&
      this.animateWelcome &&
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === false
    ) {
      this.classList.add("welcome-rolling");
    }
    if (!["slack", "slack-account"].includes(this.widget)) void this.loadCatalog();
  }
  private drawPicker(): void {
    const target = this.querySelector<HTMLElement>(".welcome-picker");
    const connected = this.preview
      ? previewConnections(this.previewUser())
      : this.connections.map((account) => account.toolkit);
    if (target && !this.error && !this.loading)
      mountConnectionPicker(
        target,
        this.services.map((service) => ({ ...service, connected: connected.includes(service.id) })),
        (service) => this.authorize(service),
        this.pickerState,
      );
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.controller?.abort();
    this.connectionsController?.abort();
    window.removeEventListener("focus", this.refreshConnections);
    document.removeEventListener("visibilitychange", this.refreshConnections);
  }
  private async loadConnections(): Promise<void> {
    this.connectionsController?.abort();
    const controller = (this.connectionsController = new AbortController());
    this.connectionError = "";
    try {
      const accounts: Array<{ id: string; toolkit: string }> = [];
      const seen = new Set<string>();
      let cursor = "";
      do {
        if (seen.has(cursor) || seen.size >= 100) throw new Error(t("Could not finish checking connected apps."));
        seen.add(cursor);
        const response = await fetch(`${this.base}api/composio/connections?${new URLSearchParams({ cursor })}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.items))
          throw new Error(t("Could not check connected apps. Please try again."));
        accounts.push(...result.items);
        cursor = typeof result.nextCursor === "string" ? result.nextCursor : "";
      } while (cursor);
      if (!this.isConnected || controller.signal.aborted) return;
      this.connections = accounts;
      if (this.realReturn) {
        const attempt = this.realReturn;
        const verified = accounts.some(
          (account) => account.id === attempt.accountId && account.toolkit === attempt.service.id,
        );
        if (verified && (!this.returnAccount || this.returnAccount === attempt.accountId))
          this.connectionOutcome = "success";
        else this.connectionOutcome = this.returnError === "access_denied" ? "cancelled" : "failed";
        clearConnectionAttempt(this.previewUser());
        if (this.connectionOutcome === "success") {
          completeConnectionReturn(this.previewUser(), attempt.state);
          this.realReturn = null;
        }
      }
      await this.updateComplete;
      this.drawPicker();
    } catch (error) {
      if (controller.signal.aborted || !this.isConnected) return;
      this.connections = [];
      this.connectionOutcome = "";
      this.connectionError = error instanceof Error ? error.message : t("Could not check connected apps.");
      await this.updateComplete;
      this.drawPicker();
    }
  }
  private async loadCatalog(): Promise<void> {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.loading = true;
    this.error = "";
    const services: ConnectionService[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    try {
      do {
        if (cursors.has(cursor)) throw new Error(t("Could not finish loading apps. Please try again."));
        cursors.add(cursor);
        const response = await fetch(`${this.base}api/composio/toolkits?${new URLSearchParams({ cursor })}`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            composioUnavailableMessage(result) ?? t("App connections are unavailable right now. Please try again."),
          );
        for (const item of result.items as Array<{ id: string; name: string; description: string }>) {
          if (item.id !== "slack" && !services.some((service) => service.id === item.id))
            services.push({ ...item, popularity: 100000 - services.length });
        }
        cursor = typeof result.nextCursor === "string" ? result.nextCursor : "";
        if (cursors.size > 100) throw new Error(t("Could not finish loading apps. Please try again."));
      } while (cursor);
      this.services = services;
    } catch (error) {
      if (controller.signal.aborted) return;
      this.error = error instanceof Error ? error.message : t("Could not load apps. Please try again.");
    }
    if (!this.isConnected || controller.signal.aborted) return;
    this.loading = false;
    await this.updateComplete;
    this.drawPicker();
    const restoreTop = this.returned?.scrollTop ?? this.restoreScrollTop;
    if (restoreTop !== null && restoreTop !== undefined) {
      await this.updateComplete;
      requestAnimationFrame(() => {
        const scroller = this.closest(".chat-scroll");
        if (scroller && this.isConnected) scroller.scrollTop = restoreTop;
        this.restoreScrollTop = null;
      });
    }
  }
  private async authorize(service: ConnectionService): Promise<void> {
    if (this.authorizing) return;
    if (this.preview) {
      startPreviewAttempt(this.previewUser(), service, this.pickerState, this.closest(".chat-scroll")?.scrollTop ?? 0);
      return;
    }
    this.authorizing = service.name;
    this.authorizationError = "";
    try {
      if (await openDesktopBrowser(`${this.base}settings`)) return;
      const state = crypto.randomUUID();
      const attempt: ConnectionAttempt = {
        state,
        user: this.previewUser(),
        service: { id: service.id, name: service.name },
        accountId: "",
        widget: this.returnKey,
        expiresAt: Date.now() + 20 * 60_000,
        path: location.pathname,
        picker: { ...this.pickerState },
        scrollTop: this.closest(".chat-scroll")?.scrollTop ?? 0,
      };
      saveConnectionAttempt(attempt);
      const response = await fetch(`${this.base}api/composio/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: service.id, returnTo: location.pathname + location.search, state }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(composioUnavailableMessage(result) ?? t("Could not open authorization. Please try again."));
      if (typeof result.accountId !== "string" || !/^ca_[a-zA-Z0-9_-]+$/.test(result.accountId))
        throw new Error(t("Could not start authorization. Please try again."));
      saveConnectionAttempt({ ...attempt, accountId: result.accountId });
      window.location.assign(result.url);
    } catch (error) {
      this.authorizationError =
        error instanceof Error ? error.message : t("Could not open authorization. Please try again.");
    } finally {
      this.authorizing = "";
    }
  }
  protected render() {
    if (this.preview && previewParameters().has("connectionConsent")) {
      return html`<section class="connection-consent-preview">
        <span class="connection-preview-label">${t("Provider simulation · No account access")}</span>
        <h1>${this.consent ? t("Connect {name}", { name: this.consent.service.name }) : t("This preview has expired")}</h1>
        <p>
          ${t("This stands in for the provider’s consent page. Choose an outcome to return to QM through the callback URL.")}
        </p>
        ${
          this.consent
            ? html`<div class="connection-preview-actions">
                  <button class="btn" @click=${() => finishPreviewAttempt(this.consent!, "success")}>
                    ${t("Approve connection")}
                  </button>
                  <button class="btn" @click=${() => finishPreviewAttempt(this.consent!, "cancelled")}>${t("Cancel")}</button>
                  <button class="btn" @click=${() => finishPreviewAttempt(this.consent!, "failed")}>
                    ${t("Simulate provider error")}
                  </button>
                </div>
                <details>
                  <summary>${t("Callback URL")}</summary>
                  <code>${this.consent.callbackUrl}</code>
                </details>`
            : nothing
        }
        <a href="?connectionDemo=1">${t("Back to QM")}</a>
      </section>`;
    }
    const name = this.me?.displayName?.trim().split(/\s+/)[0];
    const cohort = this.me?.welcomeCohort;
    const serviceName = this.retryService?.name ?? t("App");
    const connected = this.preview
      ? previewConnections(this.previewUser())
      : this.connections.map((account) => account.toolkit);
    const connectedServices = [...new Set(connected)].map(
      (id) => this.services.find((service) => service.id === id) ?? { id, name: id },
    );
    const outcome = {
      "": { title: "", detail: "" },
      checking: {
        title: t("Checking {name} connection…", { name: serviceName }),
        detail: t("Confirming access before marking it connected."),
      },
      success: {
        title: t("{name} connected", { name: serviceName }),
        detail: "",
      },
      cancelled: {
        title: t("{name} wasn’t connected", { name: serviceName }),
        detail: t("You cancelled authorization. You can try again whenever you’re ready."),
      },
      expired: {
        title: t("This connection attempt has expired"),
        detail: t("Choose an app below to start again."),
      },
      failed: {
        title: t("Couldn’t connect {name}", { name: serviceName }),
        detail: t("We couldn’t confirm an active connection yet. Try checking again, or restart authorization."),
      },
    }[this.connectionOutcome];
    return html`<section class="welcome-content">
      ${this.preview
        ? html`<div class="connection-preview-label">
            ${t("Connection preview · No accounts are linked")}
            <button @click=${() => resetPreview(this.previewUser())}>${t("Reset")}</button>
          </div>`
        : nothing}
      ${
        this.setupOnly
          ? nothing
          : html`<h1 class="welcome-beat" style="--welcome-delay:0ms">${name ? t("Hi, {name}.", { name }) : t("Hi there.")}</h1>
              ${
                cohort
                  ? html`<div class="welcome-cohort welcome-beat" style="--welcome-delay:700ms">
                      <span class="welcome-cohort-label">${t("Welcome to {cohort}!", { cohort })}</span
                      ><span class="welcome-champagne" aria-hidden="true">🥂</span>
                      ${Array.from({ length: 18 }, (_, i) => {
                        const side = i % 2 ? 1 : -1;
                        const distance = 35 + ((i * 37) % 85);
                        const turn = side * (80 + ((i * 47) % 190));
                        return html`<span
                          aria-hidden="true"
                          class="welcome-flutter"
                          style=${`--flutter-color:${["#f26522", "#f5ad56", "#d5bb88", "#e8c899"][i % 4]};--flutter-delay:${1750 + (i % 6) * 65}ms;--flutter-mid:${side * distance * 0.7}px;--flutter-x:${side * distance}px;--flutter-peak:${-28 - ((i * 19) % 36)}px;--flutter-end:${15 + ((i * 11) % 20)}px;--flutter-turn:${turn}deg;--flutter-turn-end:${turn * 2}deg`}
                        ></span>`;
                      })}
                    </div>`
                  : nothing
              }
              ${
                cohort
                  ? html`<p class="welcome-beat" style="--welcome-delay:2400ms">
                        ${t("And welcome to QM, the agent harness we use to run YC.")}
                      </p>
                      <p class="welcome-beat" style="--welcome-delay:2600ms">
                        ${t("Use it to research customers and investors, fundraise, and automate the everyday work of running {company}", { company: this.me?.companyName?.trim() || t("your company") })}.
                        ${this.onMoreIdeas ? html`<button type="button" class="welcome-more-ideas" ?disabled=${this.ideasDisabled} @click=${this.onMoreIdeas}>${t("More ideas")}</button>` : nothing}
                      </p>
                      <p class="welcome-beat" style="--welcome-delay:2800ms">
                        ${t("Think of it as your YC partner in a box. The more you use QM, the more context we have, the more we can help.")}
                      </p>`
                  : html`<p class="welcome-beat" style="--welcome-delay:400ms">
                        ${t("Welcome to QM, your agent harness. Use it to research customers, build tools, and automate the everyday work of running {company}", { company: this.me?.companyName?.trim() || t("your company") })}
                      </p>
                      <p class="welcome-beat" style="--welcome-delay:700ms">${t("The easiest way to get up and running:")}</p>`
              }`
      }
      ${
        !["apps", "slack-account"].includes(this.widget) && this.me?.permissions?.includes("admin")
          ? html`<qm-onboarding-slack
              class="welcome-beat"
              style=${`--welcome-delay:${cohort ? 3050 : 900}ms`}
              .adminBase=${this.adminBase}
              @slack-installation-status=${(event: CustomEvent<{ connected: boolean }>) => {
                this.workspaceConnected = event.detail.connected;
              }}
            ></qm-onboarding-slack>`
          : nothing
      }
      ${this.widget === "slack-account" && this.workspaceError
        ? html`<p role="status">
            ${t("Could not check Slack setup.")}
            <button class="btn" @click=${() => void this.refreshWorkspace()}>${t("Try again")}</button>
          </p>`
        : nothing}
      ${this.widget === "slack-account" && this.workspaceConnected === false
        ? html`<p role="status">
            ${t(
              "QM needs to be added to your company’s Slack workspace before you can link your account. Ask an administrator to finish setup.",
            )}
          </p>`
        : nothing}
      <div class="welcome-beat" style=${`--welcome-delay:${cohort ? 3250 : 1100}ms`}>
        ${this.workspaceConnected && this.widget !== "apps" && (["slack", "slack-account"].includes(this.widget) || (!this.loading && !this.error)) ? html`<qm-slack-account .user=${this.previewUser()}></qm-slack-account>` : nothing}
      </div>
      ${
        ["slack", "slack-account"].includes(this.widget)
          ? nothing
          : html`<div class="welcome-beat" style=${`--welcome-delay:${cohort ? 3450 : 1300}ms`}>
              ${this.loading
                ? html`<div class="welcome-load" role="status">${t("Loading your available apps…")}</div>`
                : nothing}
              ${
                this.error
                  ? html`<div class="welcome-load">
                      <strong>${t("Connect your apps")}</strong>
                      <p role="status">${this.error}</p>
                      <button
                        type="button"
                        class="btn"
                        @click=${() => {
                          void this.loadCatalog();
                          void this.loadConnections();
                          void this.refreshWorkspace();
                        }}
                      >
                        ${t("Try again")}
                      </button>
                    </div>`
                  : nothing
              }
              ${
                this.connectionOutcome && this.connectionOutcome !== "success"
                  ? html`<div
                      class="connection-result"
                      data-outcome=${this.connectionOutcome}
                      role="status"
                      aria-live="polite"
                    >
                      <strong>${outcome.title}</strong>
                      ${outcome.detail ? html`<p>${outcome.detail}</p>` : nothing}
                      ${["cancelled", "failed"].includes(this.connectionOutcome) && this.retryService
                        ? html`<button class="btn" @click=${() => this.authorize({ ...this.retryService!, description: "", popularity: 0 })}>
                            ${t("Try again")}
                          </button>`
                        : nothing}
                    </div>`
                  : nothing
              }
              ${this.connectionError && !this.error && !this.loading
                ? html`<div class="welcome-connection-status" role="status">
                    ${this.connectionError}
                    <button class="btn" @click=${() => void this.loadConnections()}>${t("Check again")}</button>
                  </div>`
                : nothing}
              ${!this.preview && this.connectionOutcome === "failed"
                ? html`<button class="btn" @click=${() => void this.loadConnections()}>${t("Check again")}</button>`
                : nothing}
              <div class="welcome-picker" ?inert=${Boolean(this.authorizing)}></div>
              ${
                connectedServices.length
                  ? html`<div class="connection-connected" role="status" aria-live="polite">
                      ${connectedServices.map((service) => html`<span>${icon(Check, 10)}${service.name} connected</span>`)}
                    </div>`
                  : nothing
              }
              ${this.authorizing ? html`<p class="welcome-connection-status" role="status">${t("Opening {name}…", { name: this.authorizing })}</p>` : nothing}
              ${this.authorizationError ? html`<p class="welcome-connection-status" role="alert">${this.authorizationError}</p>` : nothing}
            </div>`
      }
    </section>`;
  }
}
if (!customElements.get("qm-onboarding-welcome")) customElements.define("qm-onboarding-welcome", OnboardingWelcome);
