import { onLocaleChange, translate } from "./i18n.ts";

export const t = translate;

export interface LocaleReactiveHost {
  requestUpdate(): void;
}

export class LocaleController<H extends LocaleReactiveHost = LocaleReactiveHost> {
  readonly host: H;
  #unsubscribe: (() => void) | undefined;

  constructor(host: H) {
    this.host = host;
  }

  hostConnected(): void {
    this.#unsubscribe ??= onLocaleChange(() => this.host.requestUpdate());
  }

  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }
}
