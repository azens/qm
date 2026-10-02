import { html, nothing } from "lit";
import { t } from "../../chassis/src/i18n-lit.ts";
import { renderer } from "./shared.ts";
type Context = {
  stateToUrl: (state: Record<string, unknown>) => string;
  scope: () => string;
  searchField: (options: Record<string, unknown>) => Node;
  twoWayToggle: (options: Record<string, unknown>) => Node;
  fileThumb: (item: Record<string, unknown>) => Node;
  initCustomDropdowns: (root: HTMLElement) => void;
};
const DESIGN_TOKENS = [
  ["--bg", "Page behind every surface"],
  ["--surface", "Cards, dialogs, table bodies"],
  ["--subtle", "Quiet control and inset backgrounds"],
  ["--border", "Every hairline and divider"],
  ["--text", "Primary copy"],
  ["--muted", "Secondary copy and hints"],
  ["--cta", "Primary actions and selected controls"],
  ["--ok", "Confirmed and healthy"],
  ["--warn", "Needs attention"],
  ["--danger", "Destructive and failed"],
  ["--trigger", "Automation and triggers"],
];

type Status = { key: string; vars?: Record<string, string | number> };

export function show(context: Context) {
  const root = document.getElementById("view-design")!;
  if (root.dataset.litDesign) return;
  root.dataset.litDesign = "true";
  const draw = renderer(root);
  const state = {
    scopeStatus: { key: "Choose a scope to try the row interaction." } as Status,
    fileStatus: { key: "File names, thumbnails, sizes, and dates stay visible." } as Status,
    packStatus: { key: "Registration is a local demonstration." } as Status,
    searchStatus: { key: "Type to try the search field, then clear it." } as Status,
    toggleStatus: { key: "Selected: {option}", vars: { option: "Human activity" } } as Status,
    advanced: false,
    name: "Acme",
    savedName: "Acme",
    nameSaved: false,
    chip: true,
  };
  const update = (change: Partial<typeof state>) => {
    Object.assign(state, change);
    paint();
  };
  const dialog = () => document.getElementById("design-dialog") as HTMLDialogElement;
  const search = context.searchField({
    placeholder: t("Search messages…"),
    onInput: (value: string) =>
      update({
        searchStatus: value
          ? { key: "Search query: {query}", vars: { query: value } }
          : { key: "Type to try the search field, then clear it." },
      }),
  });
  const searchFilled = context.searchField({ placeholder: t("Search messages…"), value: "Product updates" });
  const searchDisabled = context.searchField({ placeholder: t("Search unavailable"), disabled: true });
  const options = [
    { value: "human", label: t("Human activity") },
    { value: "all", label: t("All activity") },
  ];
  const toggle = context.twoWayToggle({
    label: t("Example activity sort"),
    options,
    value: "human",
    onChange: (value: string) => {
      const selected = options.find((o) => o.value === value)!;
      update({ toggleStatus: { key: "Selected: {option}", vars: { option: selected.label } } });
    },
  });
  const toggleDisabled = context.twoWayToggle({
    label: t("Disabled activity sort"),
    options,
    value: "human",
    disabled: true,
    onChange: () => {},
  });
  const scopeList = () =>
    html`<div class="dense-list">
      ${[
        {
          name: t("Example team"),
          preview: t("{count} skills", { count: 12 }),
          time: t("{minutes}m ago", { minutes: 5 }),
        },
        { name: t("Research"), preview: t("{count} skills", { count: 4 }), time: t("Yesterday") },
      ].map(
        (item) =>
          html`<div
            class="dense-row"
            tabindex="0"
            role="button"
            @click=${() => update({ scopeStatus: { key: "Selected: {name}", vars: { name: item.name } } })}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") update({ scopeStatus: { key: "Selected: {name}", vars: { name: item.name } } });
            }}
          >
            <span class="dense-name">${item.name}</span><span class="dense-preview">${item.preview}</span
            ><span class="dense-time">${item.time}</span>
          </div>`,
      )}
    </div>`;
  const fileItems = [
    { name: "Research brief.pdf", size: "240 KB", date: t("Today") },
    { name: "Project notes.md", size: "8 KB", date: t("Yesterday") },
  ].map((item) => ({ ...item, thumb: context.fileThumb(item) }));
  const fileList = () =>
    html`<div class="dense-list">
      ${fileItems.map(
        (item) =>
          html`<div
            class="dense-row"
            tabindex="0"
            role="button"
            @click=${() =>
              update({
                fileStatus: { key: "Selected: {name} (demo only)", vars: { name: item.name } },
              })}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter")
                update({
                  fileStatus: { key: "Selected: {name} (demo only)", vars: { name: item.name } },
                });
            }}
          >
            <span class="dense-icon">${item.thumb}</span><span class="dense-name">${item.name}</span
            ><span class="dense-preview">${t("Example team")}</span
            ><span class="dense-time">${item.size + " · " + item.date}</span>
          </div>`,
      )}
    </div>`;
  function nameStatus() {
    if (state.name !== state.savedName) return t("Unsaved changes");
    return state.nameSaved ? t("Saved in this example") : t("No changes");
  }
  function paint() {
    draw(() => {
      const titles: { id: string; label: string }[] = [];
      const designSpec = (label: string, note: string, demo: unknown, stack = false) =>
        html`<div class="spec">
          <div class="spec-label">${label}${note ? html`<span>${note}</span>` : nothing}</div>
          <div class=${"spec-demo" + (stack ? " stack" : "")}>${demo}</div>
        </div>`;
      const designSection = (id: string, title: string, blurb: string, specs: unknown[]) => {
        titles.push({ id, label: title });
        return html`<section class="design-group" id=${"design-group-" + id}>
          <h2>${title}</h2>
          <p>${blurb}</p>
          ${specs}
        </section>`;
      };
      const swatches = DESIGN_TOKENS.map(
        (token) =>
          html`<div class="swatch">
            <div class="swatch-chip" style=${"background: var(" + token[0] + ")"}></div>
            <div class="swatch-meta"><b>${token[0]}</b>${t(token[1])}</div>
          </div>`,
      );
      const sections = [
        html`<p class="lead">
          ${t(
            "Components and page patterns from the redesigned admin portal, including Skills, Files, Sessions, Metrics, Audit, and Egress. Examples use fictional data and do not save changes.",
          )}
        </p>`,
        designSection("foundations", t("Foundations"), t("One palette, a small type scale, and consistent spacing."), [
          designSpec(
            t("Semantic colors"),
            t("Shared theme tokens · light and dark"),
            html`<div class="swatches">${swatches}</div>`,
          ),
          designSpec(
            t("Type & spacing"),
            t("22px page title · 14px section title · 13px controls and copy"),
            html`<div class="shell-title">${t("Page title")}</div>
              <div class="head">
                <h2>${t("Section title")}</h2>
                <p>${t("Descriptions explain the setting.")}</p>
              </div>
              <label>${t("Field label")}</label>
              <p class="hint">${t("4px label gap · 8px action gap · 24px section spacing")}</p>`,
            true,
          ),
        ]),
        designSection(
          "page-layout",
          t("Page layout"),
          t(
            "Start with the shared shell. Align titles, sections, and rows to the same content edge; use whitespace and dividers instead of enclosing cards.",
          ),
          [
            designSpec(
              t("Desktop and mobile"),
              t("Authored layout diagrams · .admin-main → .admin-inner → .shellbar"),
              html`<div class="design-layouts">
                <div class="design-layout-frame">
                  <div class="design-layout-nav">${t("Sidebar")}<br />${t("Independent scroll")}</div>
                  <div class="design-layout-main">
                    <div class="design-layout-content">
                      <div class="design-layout-title">${t("Title")} <span>${t("Search / action")}</span></div>
                      <div class="design-layout-section">
                        ${t("Open section")}<br /><small>${t("Heading + description")}</small>
                      </div>
                      <div class="design-layout-lines">
                        ${t("Compact rows")}<br />────────────────<br />${t("Compact rows")}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="design-layout-frame mobile">
                  <div class="design-layout-nav">${t("Horizontal navigation")}</div>
                  <div class="design-layout-main">
                    <div class="design-layout-content">
                      <div class="design-layout-title">${t("Title")}</div>
                      <div class="design-layout-section">${t("Full-width search")}</div>
                      <div class="design-layout-lines">
                        ${t("Stacked content")}<br />────────────<br />${t("Local table scroll")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>`,
              true,
            ),
            designSpec(
              t("Width and page padding"),
              t("Current New CSS · index.html and admin-components.css"),
              html`<div class="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>${t("Rule")}</th>
                      <th>${t("Desktop")}</th>
                      <th>${t("Small screens")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${t("Navigation")}</td>
                      <td>${t("280px sidebar; independent scroll")}</td>
                      <td>${t("Horizontal navigation at ≤900px")}</td>
                    </tr>
                    <tr>
                      <td>${t("Content width")}</td>
                      <td>${t("960px maximum, centered; fluid below that")}</td>
                      <td>${t("Available width; min-width: 0")}</td>
                    </tr>
                    <tr>
                      <td>${t("Main padding")}</td>
                      <td>${t("28px top and sides")}</td>
                      <td>${t("At ≤900px: 18px top, 14px sides with safe-area insets")}</td>
                    </tr>
                    <tr>
                      <td>${t("Bottom clearance")}</td>
                      <td colspan="2">${t("110px for the fixed Original / New switch")}</td>
                    </tr>
                    <tr>
                      <td>${t("Page heading")}</td>
                      <td colspan="2">
                        ${t("22px / 500 weight; shared shell spacing 16px (activity pages use 24px)")}
                      </td>
                    </tr>
                    <tr>
                      <td>${t("Sections")}</td>
                      <td colspan="2">${t("24px between artifact sections; 12px from section heading to content")}</td>
                    </tr>
                    <tr>
                      <td>${t("Controls")}</td>
                      <td colspan="2">${t("32px height · 6px radius · 8px gap · 4px label gap")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>`,
              true,
            ),
            designSpec(
              t("Choose a page pattern"),
              t("Live references · preserve the selected organization"),
              html`<div class="design-page-links">
                <a
                  data-design-view="governance"
                  href=${context.stateToUrl({ view: "governance", scope: context.scope() })}
                  >${t("Governance / Models")}</a
                >
                <p>
                  ${t(
                  "Descriptions beside settings, 40px column gap; stack on small screens. Keep Apply right-aligned with status on its left.",
                )}
                </p>
                <a data-design-view="skills" href=${context.stateToUrl({ view: "skills", scope: context.scope() })}
                  >${t("Skills")}</a
                >
                <p>
                  ${t("Open installed-skill and skill-pack sections; compact tables and an inline registration form.")}
                </p>
                <a data-design-view="files" href=${context.stateToUrl({ view: "files", scope: context.scope() })}
                  >${t("Files")}</a
                >
                <p>${t("Search in the header, flat upload toolbar, then scopes or files with metadata.")}</p>
                <a data-design-view="history" href=${context.stateToUrl({ view: "history", scope: context.scope() })}
                  >${t("Sessions")}</a
                >
                <p>${t("Two-way sort toggle, named environments, and a separately titled conversation list.")}</p>
                <a data-design-view="audit" href=${context.stateToUrl({ view: "audit", scope: context.scope() })}
                  >${t("Audit")}</a
                >
                ·
                <a data-design-view="egress" href=${context.stateToUrl({ view: "egress", scope: context.scope() })}
                  >${t("Egress")}</a
                >
                <p>${t("Filters above plain tables; headers stay transparent and regular-weight.")}</p>
              </div>`,
              true,
            ),
            designSpec(
              t("Responsive behavior"),
              t("Page-level rules"),
              html`<ul class="design-rules">
                <li>${t("At ≤900px, the sidebar becomes horizontal navigation.")}</li>
                <li>
                  ${t(
                  "At ≤640px, Skills and Files search uses the full row; dense rows allow more height and Files metadata wraps below the name.",
                )}
                </li>
                <li>
                  ${t("Wide tables scroll inside .tablewrap. Never force the entire document wider than the viewport.")}
                </li>
                <li>
                  ${t(
                  "Keep all actions and metadata available on mobile. Use wrapping or local scrolling rather than hiding content.",
                )}
                </li>
                <li>${t("Sidebar scrolling is contained; reaching its end must not scroll the main page.")}</li>
              </ul>`,
              true,
            ),
          ],
        ),
        designSection(
          "artifact-patterns",
          t("Artifact and reporting patterns"),
          t(
            "Compositions from the recent redesigns. Shared helpers render the lists; the form and report examples are local demonstrations.",
          ),
          [
            designSpec(
              t("Scope list"),
              t("denseList() · shared Skills / Files row styles · Enter or click selects a demo row"),
              html`<div id="design-scope-list">${scopeList()}</div>
                <p class="hint" id="design-scope-status" role="status">
                  ${t(state.scopeStatus.key, state.scopeStatus.vars)}
                </p>`,
              true,
            ),
            designSpec(
              t("File list and upload toolbar"),
              t("denseList() + fileThumb() · .file-upload · visual upload example, no network requests"),
              html`<div class="file-upload">
                  <div class="file-upload-actions">
                    <button
                      type="button"
                      class="primary upload-button"
                      id="design-upload"
                      @click=${() =>
                      update({
                        fileStatus: {
                          key: "On Files, this opens the file picker. This example does not upload files.",
                        },
                      })}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></svg
                      ><span>${t("Upload")}</span>
                    </button>
                  </div>
                </div>
                <div id="design-file-list">${fileList()}</div>
                <p class="hint" id="design-file-status" role="status">
                  ${t(state.fileStatus.key, state.fileStatus.vars)}
                </p>`,
              true,
            ),
            designSpec(
              t("Skill-pack registration"),
              t(".pack-register · shared Skills styles · local form demonstration"),
              html`<div class="pack-register">
                  <input
                    type="url"
                    aria-label=${t("Example skill repository")}
                    placeholder="https://github.com/example/skills"
                  /><button
                    type="button"
                    id="design-register"
                    @click=${() =>
                    update({
                      packStatus: { key: "Example registered locally. No repository was fetched." },
                    })}
                  >
                    ${t("Register")}</button
                  ><button
                    type="button"
                    class="linkish"
                    id="design-advanced"
                    @click=${() => update({ advanced: !state.advanced })}
                    aria-expanded=${String(state.advanced)}
                    aria-controls="design-pack-advanced"
                  >
                    ${t("Advanced")}
                  </button>
                </div>
                <div class=${state.advanced ? "pack-adv" : "pack-adv hidden"} id="design-pack-advanced">
                  <div>
                    <label for="design-pack-name">${t("Name")}</label
                    ><input id="design-pack-name" type="text" placeholder=${t("Team skills")} />
                  </div>
                  <div>
                    <label for="design-pack-ref">${t("Ref")}</label
                    ><input id="design-pack-ref" type="text" placeholder="main" />
                  </div>
                  <div>
                    <label for="design-pack-path">${t("Path")}</label
                    ><input id="design-pack-path" type="text" placeholder="skills/" />
                  </div>
                </div>
                <p class="hint" id="design-pack-status" role="status">
                  ${t(state.packStatus.key, state.packStatus.vars)}
                </p>`,
              true,
            ),
            designSpec(
              t("Open report section"),
              t("Authored Metrics / Audit / Egress composition · statline() + shared table controls"),
              html`<section class="design-open-section">
                <h3>${t("Activity summary")}</h3>
                <p class="hint">${t("Keep descriptions beside the section they explain.")}</p>
                <div id="design-metrics-summary">
                  <div class="statline">
                    ${t("{requests} requests · {scopes} scopes · {window}", {
                  requests: 152,
                  scopes: 2,
                  window: t("Last 24 hours"),
                })}
                  </div>
                </div>
                <div class="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>${t("Scope")}</th>
                        <th>${t("Requests")}</th>
                        <th>${t("Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>${t("Example team")}</td>
                        <td>128</td>
                        <td><span class="badge ok">${t("Healthy")}</span></td>
                      </tr>
                      <tr>
                        <td>${t("Research")}</td>
                        <td>24</td>
                        <td><span class="badge muted">${t("Idle")}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>`,
              true,
            ),
          ],
        ),
        designSection(
          "actions",
          t("Actions"),
          t("32px controls with a 6px radius. Primary actions use the dark blue accent."),
          [
            designSpec(
              t("Buttons"),
              t("button · .primary · .danger"),
              html`<button type="button" class="primary">${t("Apply")}</button
                ><button type="button">${t("Add item")}</button
                ><button type="button" class="danger">${t("Delete")}</button
                ><button type="button" disabled>${t("Disabled")}</button
                ><button type="button" class="primary" disabled>${t("Apply")}</button>`,
            ),
            designSpec(
              t("Quiet actions"),
              t(".viewlink · .icon-button"),
              html`<button type="button" class="viewlink">${t("View history ›")}</button
                ><button type="button" class="icon-button" aria-label=${t("Remove example")}>×</button>`,
            ),
            designSpec(
              t("Save feedback"),
              t(".foot · .status · native input events"),
              html`<section class="card">
                <div class="head">
                  <h2>${t("Example setting")}</h2>
                  <p>${t("Edit the name to try unsaved and saved states.")}</p>
                </div>
                <div class="body">
                  <label for="design-name">${t("Display name")}</label
                  ><input
                    id="design-name"
                    type="text"
                    .value=${state.name}
                    @input=${(e: Event) => update({ name: (e.target as HTMLInputElement).value, nameSaved: false })}
                  />
                </div>
                <div class="foot">
                  <span class="status" id="design-status" role="status">${nameStatus()}</span
                  ><button
                    class="primary"
                    type="button"
                    id="design-apply"
                    ?disabled=${state.name === state.savedName}
                    @click=${() => update({ savedName: state.name, nameSaved: true })}
                  >
                    ${t("Apply")}
                  </button>
                </div>
              </section>`,
              true,
            ),
          ],
        ),
        designSection(
          "two-way-toggle",
          t("Two-way toggle"),
          t("Choose one of two mutually exclusive options. Tab to focus; use arrow keys to switch."),
          [
            designSpec(
              t("Segmented choice"),
              t("twoWayToggle({ label, options, value, onChange, disabled }) · shared radio group"),
              html`<div id="design-two-way-toggle">${toggle}</div>
                <p class="hint" id="design-two-way-status" role="status">
                  ${t(state.toggleStatus.key, state.toggleStatus.vars)}
                </p>`,
              true,
            ),
            designSpec(
              t("Disabled"),
              t("The same component with disabled: true"),
              html`<div id="design-two-way-disabled">${toggleDisabled}</div>`,
            ),
          ],
        ),
        designSection(
          "search",
          t("Search"),
          t(
            "A transparent background, subtle border, search icon, and clear action. Focus uses the shared dark blue accent.",
          ),
          [
            designSpec(
              t("Search field"),
              t("searchField() · shared with Slack and page toolbar searches"),
              html`<div id="design-search">${search}</div>
                <p class="hint" id="design-search-status" role="status">
                  ${t(state.searchStatus.key, state.searchStatus.vars)}
                </p>`,
              true,
            ),
            designSpec(
              t("Populated and disabled"),
              t("The same component with value and disabled options"),
              html`<div id="design-search-filled">${searchFilled}</div>
                <div id="design-search-disabled">${searchDisabled}</div>`,
              true,
            ),
          ],
        ),
        designSection(
          "fields",
          t("Fields"),
          t("Shared sizing, labels, hints, focus rings, validation, and disabled states."),
          [
            designSpec(
              t("Text fields"),
              t("input · label · .hint"),
              html`<label for="design-text">${t("Client ID")}</label
                ><input
                  id="design-text"
                  type="text"
                  placeholder=${t("Enter a client ID")}
                  aria-describedby="design-text-hint"
                />
                <p class="hint" id="design-text-hint">${t("A label stays visible when the field has a value.")}</p>
                <label for="design-number">${t("Limit")}</label
                ><input id="design-number" type="number" value="10" /><label for="design-disabled"
                  >${t("Inherited value")}</label
                ><input id="design-disabled" type="text" disabled value=${t("Organization default")} /><label
                  for="design-invalid"
                  >${t("Required value")}</label
                ><input id="design-invalid" type="text" aria-invalid="true" aria-describedby="design-error" />
                <p class="status err" id="design-error">${t("Enter a value to continue.")}</p>`,
              true,
            ),
            designSpec(
              t("Dropdown"),
              t("select → shared .dd accessible dropdown"),
              html`<label for="design-select">${t("Scope")}</label
                ><select id="design-select">
                  <option>${t("Organization")}</option>
                  <option>${t("Team")}</option>
                  <option>${t("Personal")}</option>
                </select>`,
              true,
            ),
            designSpec(
              t("Multiline"),
              t("textarea · same field border and label"),
              html`<label for="design-notes">${t("Instructions")}</label
                ><textarea id="design-notes" rows="3" placeholder=${t("Write instructions…")}></textarea>`,
              true,
            ),
            designSpec(
              t("Choices"),
              t(".choice-stack · .posture-choice"),
              html`<div class="choice-stack">
                <label class="posture-choice"
                  ><input type="radio" name="design-choice" checked /><span
                    ><strong>${t("Automatic")}</strong><small>${t("Review activity when needed.")}</small></span
                  ></label
                ><label class="posture-choice"
                  ><input type="radio" name="design-choice" /><span
                    ><strong>${t("Always review")}</strong><small>${t("Review every request.")}</small></span
                  ></label
                >
              </div>`,
              true,
            ),
            designSpec(
              t("Switch & checkbox"),
              t(".setting-toggle · .setting-switch · input[type=checkbox]"),
              html`<label class="setting-toggle"
                  ><input type="checkbox" checked /><span class="setting-switch" aria-hidden="true"></span
                  ><span>${t("Enable feature")}</span></label
                ><label><input type="checkbox" /> ${t("Include optional details")}</label>`,
              true,
            ),
          ],
        ),
        designSection(
          "sections-lists",
          t("Sections & lists"),
          t("Open sections separated by rules, with the same headings, descriptions, and row actions."),
          [
            designSpec(
              t("Settings section"),
              t(".card > .head / .body / .foot"),
              html`<section class="card">
                <div class="head">
                  <h2>${t("Section title")}</h2>
                  <p>${t("Explain what the setting changes.")}</p>
                </div>
                <div class="body">
                  <label for="design-section-field">${t("Setting label")}</label
                  ><input id="design-section-field" type="text" value=${t("Default value")} />
                </div>
                <div class="foot">
                  <span class="status">${t("No changes")}</span
                  ><button class="primary" type="button" disabled>${t("Apply")}</button>
                </div>
              </section>`,
              true,
            ),
            designSpec(
              t("List row"),
              t(".credential-row · .credential-title · .credential-actions"),
              html`<div class="credential-row">
                <div class="credential-main">
                  <div class="credential-title">
                    <strong>${t("Example service")}</strong><span class="credential-slug">example</span>
                  </div>
                  <p class="hint">${t("Available to the organization")}</p>
                </div>
                <div class="credential-actions">
                  <button type="button">${t("Edit")}</button
                  ><button type="button" class="danger">${t("Delete")}</button>
                </div>
              </div>`,
              true,
            ),
            designSpec(
              t("Model chip"),
              t(".model-chip · removable item"),
              html`${
                  state.chip
                    ? html`<div class="model-chip">
                        <span>${t("Example model")}</span
                        ><button
                          type="button"
                          id="design-remove-chip"
                          aria-label=${t("Remove example model")}
                          @click=${() => update({ chip: false })}
                        >
                          ×
                        </button>
                      </div>`
                    : nothing
                }<span class="hint" id="design-chip-status" role="status"
                  >${state.chip ? "" : t("Example model removed")}</span
                >`,
            ),
            designSpec(
              t("Badges & feedback"),
              t(".badge · .status · semantic colors"),
              html`<span class="badge muted">${t("Inherited")}</span><span class="badge ok">${t("Enabled")}</span
                ><span class="badge warn">${t("Needs review")}</span><span class="badge err">${t("Failed")}</span
                ><span class="status ok">${t("Saved")}</span><span class="status err">${t("Save failed")}</span>`,
            ),
            designSpec(
              t("Empty state"),
              t(".empty"),
              html`<div class="empty">${t("No items yet. Add an item to get started.")}</div>`,
              true,
            ),
          ],
        ),
        designSection(
          "dialogs",
          t("Dialogs"),
          t("The same controls in a focused, keyboard-accessible dialog. Escape closes it and returns focus."),
          [
            designSpec(
              t("Review dialog"),
              t("dialog.review-dialog · shared fields and actions"),
              html`<button type="button" id="design-dialog-open" @click=${() => dialog()?.showModal()}>
                  ${t("Open example dialog")}
                </button>
                <dialog class="review-dialog" id="design-dialog" aria-labelledby="design-dialog-title">
                  <div class="review-dialog-head">
                    <h2 id="design-dialog-title">${t("Example dialog")}</h2>
                    <p>${t("Try the shared controls without changing any settings.")}</p>
                  </div>
                  <div class="review-dialog-body">
                    <label for="design-dialog-field">${t("Display name")}</label
                    ><input id="design-dialog-field" type="text" value=${t("Example")} />
                  </div>
                  <div class="review-dialog-foot">
                    <button type="button" id="design-dialog-close" @click=${() => dialog()?.close()}>
                      ${t("Cancel")}</button
                    ><button type="button" class="primary" id="design-dialog-done" @click=${() => dialog()?.close()}>
                      ${t("Done")}
                    </button>
                  </div>
                </dialog>`,
            ),
          ],
        ),
        designSection(
          "tables",
          t("Tables"),
          t("13px cells, quiet headers, consistent padding, and scrolling inside the table on small screens."),
          [
            designSpec(
              t("Data table"),
              t(".tablewrap > table · th · td"),
              html`<div class="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>${t("Name")}</th>
                      <th>${t("Access")}</th>
                      <th>${t("Status")}</th>
                      <th>${t("Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${t("Alex Example")}</td>
                      <td>${t("Organization")}</td>
                      <td><span class="badge ok">${t("Active")}</span></td>
                      <td><button type="button">${t("Edit")}</button></td>
                    </tr>
                    <tr>
                      <td>${t("Sam Example")}</td>
                      <td>${t("Team")}</td>
                      <td><span class="badge muted">${t("Invited")}</span></td>
                      <td><button type="button" disabled>${t("Edit")}</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>`,
              true,
            ),
          ],
        ),
      ];
      return html`${sections[0]}
        <nav class="design-contents" aria-label=${t("Design system sections")}>
          ${titles.map((entry) => html`<a href=${"#" + "design-group-" + entry.id}>${entry.label}</a>`)}
        </nav>
        ${sections.slice(1)}`;
    });
  }
  paint();
  context.initCustomDropdowns(root);
}
