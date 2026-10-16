import { t, onLocaleChange } from "../services/i18n.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      display: inline-flex; align-items: center; gap: var(--mw-space-2); max-width: 100%;
      padding: 0.3rem 0.8rem 0.3rem 0.65rem; border-radius: var(--mw-radius-full);
      background: rgba(0,0,0,0.62); color: var(--mw-on-dark);
      -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      font-size: var(--mw-text-sm); font-weight: 600;
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #9aa0b0; flex-shrink: 0; }
    .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
    :host([state="monitoring"]) .dot { background: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,0.25); }
    :host([state="recording"]) .dot { background: #f43f5e; animation: pulse 1.2s ease-in-out infinite; }
    :host([state="saving"]) .dot, :host([state="requesting"]) .dot, :host([state="paused"]) .dot { background: #fbbf24; }
    :host([state="waiting"]) .dot { background: #60a5fa; }
    :host([state="error"]) .dot { background: #f43f5e; }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0.55); }
      50% { box-shadow: 0 0 0 6px rgba(244,63,94,0); }
    }
    @media (prefers-reduced-motion: reduce) { :host([state="recording"]) .dot { animation: none; } }
  </style>
  <span class="dot" aria-hidden="true"></span>
  <span class="sr-only prefix"></span>
  <span class="label"></span>
`;

export class StatusIndicator extends HTMLElement {
  static get observedAttributes() {
    return ["state"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._unsub = null;
  }

  connectedCallback() {
    this.setAttribute("role", "status");
    this._render();
    this._unsub = onLocaleChange(() => this._render());
  }

  disconnectedCallback() {
    this._unsub?.();
  }

  attributeChangedCallback() {
    this._render();
  }

  _render() {
    const state = this.getAttribute("state") || "idle";
    const labelMap = {
      idle: t("statusIdle"),
      requesting: t("statusRequesting"),
      monitoring: t("statusMonitoring"),
      recording: t("statusRecording"),
      saving: t("statusSaving"),
      paused: t("statusPaused"),
      waiting: t("statusWaiting"),
      error: t("statusError"),
    };
    const label = this.shadowRoot.querySelector(".label");
    if (label) label.textContent = labelMap[state] || state;
    const prefix = this.shadowRoot.querySelector(".prefix");
    if (prefix) prefix.textContent = `${t("a11yRecordingState")}: `;
  }
}

customElements.define("status-indicator", StatusIndicator);
