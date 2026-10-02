import { html, nothing, render } from "lit";
import { Search, ArrowUpRight, Check } from "lucide";
import { connectorLogo } from "./connector-logo";
import { icon } from "./ui";
import { t } from "../../chassis/src/i18n-lit.ts";

export interface ConnectionService {
  id: string;
  name: string;
  description: string;
  popularity: number;
  logoUrl?: string;
  connected?: boolean;
}

export function mountConnectionPicker(
  container: HTMLElement,
  services: ConnectionService[],
  onSelect: (service: ConnectionService) => void,
  state: { query: string; expanded: boolean } = { query: "", expanded: false },
): void {
  let query = state.query;
  let expanded = state.expanded;
  const sorted = [...services].sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  function draw(): void {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = sorted.filter((service) => {
      const text = `${service.name} ${service.description}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    const shown = expanded || words.length ? matches : matches.slice(0, 6);
    render(
      html`<section class="connection-picker" aria-label=${t("Connect your apps")}>
        <header class="connection-picker-header">
          <div>
            <h3>${t("Connect your apps")}</h3>
          </div>
        </header>
        <label class="connection-picker-search">
          ${icon(Search, 16)}
          <input
            type="search"
            aria-label=${t("Search apps")}
            placeholder=${t("Search apps…")}
            .value=${query}
            @input=${(event: Event) => {
              query = (event.target as HTMLInputElement).value;
              state.query = query;
              draw();
            }}
          />
        </label>
        <div class="connection-picker-caption" role="status" aria-live="polite">
          ${words.length ? t(matches.length === 1 ? "{count} app found" : "{count} apps found", { count: matches.length }) : t("Popular apps")}
        </div>
        <div class="connection-picker-grid">
          ${shown.map(
            (service) =>
              html`<button
                type="button"
                class="connection-picker-app"
                ?disabled=${service.connected}
                aria-label=${service.connected ? `${service.name} connected` : `Connect ${service.name}`}
                @click=${() => onSelect(service)}
              >
                ${connectorLogo(service.id, service.logoUrl)}
                <span class="connection-picker-name">${service.name}</span>
                <span class="connection-picker-trailing">${icon(service.connected ? Check : ArrowUpRight, 14)}</span>
              </button>`,
          )}
        </div>
        ${matches.length === 0 ? html`<p class="connection-picker-empty">${t("No apps match “{query}”. Try another name.", { query })}</p>` : nothing}
        ${
          !words.length && matches.length > 6
            ? html`<button
                class="connection-picker-more"
                type="button"
                @click=${() => {
                  expanded = !expanded;
                  state.expanded = expanded;
                  draw();
                }}
              >
                ${expanded ? t("Show fewer apps") : t("Browse all {count} apps", { count: services.length })}
              </button>`
            : nothing
        }
      </section>`,
      container,
    );
  }
  draw();
}
