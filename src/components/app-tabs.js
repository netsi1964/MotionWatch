import { t, onLocaleChange } from "../services/i18n.js";
import { sharedCss } from "../styles/shared.js";
import { icon } from "./icons.js";

const TABS = [
  ["camera", "camera", "tabCamera"],
  ["recordings", "video", "tabRecordings"],
  ["settings", "sliders", "tabSettings"],
];

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host { display: block; }
    nav {
      display: flex; gap: var(--mw-space-1); justify-content: space-around;
      padding: var(--mw-space-2) var(--mw-space-3);
      padding-bottom: calc(var(--mw-space-2) + var(--mw-safe-bottom));
      padding-left: calc(var(--mw-space-3) + var(--mw-safe-left));
      padding-right: calc(var(--mw-space-3) + var(--mw-safe-right));
      background: var(--mw-glass); border-top: 1px solid var(--mw-border);
      -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
    }
    button.tab {
      flex: 1; max-width: 9rem; display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-height: 3.4rem; padding: var(--mw-space-2) var(--mw-space-2) var(--mw-space-1);
      border-radius: var(--mw-radius); color: var(--mw-text-muted); font-size: var(--mw-text-xs); font-weight: 600;
      transition: color var(--mw-transition), background var(--mw-transition);
    }
    button.tab .pill {
      display: grid; place-items: center; width: 3.6rem; height: 1.9rem; border-radius: var(--mw-radius-full);
      transition: background var(--mw-transition);
    }
    button.tab .ico { width: 1.4rem; height: 1.4rem; }
    button.tab:hover .pill { background: var(--mw-surface-3); }
    button.tab[aria-selected="true"] { color: var(--mw-text); }
    button.tab[aria-selected="true"] .pill { background: var(--mw-accent-soft); color: var(--mw-accent); }
    :host([orientation="vertical"]) nav {
      flex-direction: column; justify-content: flex-start; align-items: center; gap: var(--mw-space-3);
      height: 100%; padding: var(--mw-space-4) var(--mw-space-2); border-top: 0; border-right: 1px solid var(--mw-border);
      background: var(--mw-surface);
    }
    :host([orientation="vertical"]) button.tab { flex: none; width: 5rem; max-width: none; }
  </style>
  <nav role="tablist" part="nav">${TABS.map(([id, ic], i) => `
    <button type="button" class="tab" role="tab" id="tab-${id}" aria-controls="panel-${id}" tabindex="${i ? -1 : 0}" data-tab="${id}" aria-selected="${i === 0}">
      <span class="pill">${icon(ic)}</span>
      <span class="label"></span>
    </button>`).join("")}
  </nav>
`;

export class AppTabs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {string} */
    this._active = "camera";
    this._unsub = null;
  }

  connectedCallback() {
    this._renderLabels();
    this._unsub = onLocaleChange(() => this._renderLabels());
    this.shadowRoot.querySelectorAll('[role="tab"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (tab) this.select(tab);
      });
    });
    this.shadowRoot.querySelector('[role="tablist"]')?.addEventListener("keydown", (e) => {
      const tabs = [...this.shadowRoot.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(/** @type {Element} */ (e.target));
      if (i < 0) return;
      // arrows in both axes work, whatever the orientation
      let next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      /** @type {HTMLElement} */ (tabs[next]).focus();
      this.select(tabs[next].getAttribute("data-tab"));
    });
  }

  disconnectedCallback() {
    this._unsub?.();
  }

  _renderLabels() {
    const nav = this.shadowRoot.querySelector('[role="tablist"]');
    nav?.setAttribute("aria-label", t("a11yTablist"));
    nav?.setAttribute("aria-orientation", this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal");
    for (const [id, , key] of TABS) {
      const label = this.shadowRoot.querySelector(`#tab-${id} .label`);
      if (label) label.textContent = t(key);
    }
  }

  select(tab) {
    if (tab === this._active) return;
    this._active = tab;
    this.shadowRoot.querySelectorAll('[role="tab"]').forEach((btn) => {
      const selected = btn.getAttribute("data-tab") === tab;
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.setAttribute("tabindex", selected ? "0" : "-1");
    });
    this.dispatchEvent(new CustomEvent("tab-change", { detail: { tab }, bubbles: true, composed: true }));
  }

  get active() {
    return this._active;
  }
}

customElements.define("app-tabs", AppTabs);
