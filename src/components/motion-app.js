import { t, onLocaleChange, setLocale, getLocale } from "../services/i18n.js";
import { getSettings, onSettingsChange } from "../services/settings.js";
import { isSecureContext, hasGetUserMedia, fullCapabilityReport } from "../services/capabilities.js";
import { sharedCss } from "../styles/shared.js";
import { LOGO, icon } from "./icons.js";
import { VERSION } from "../version.js";
import "./app-tabs.js";
import "./status-indicator.js";
import "./camera-monitor.js";
import "./recording-list.js";
import "./motion-settings.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host {
      display: grid; height: 100dvh; max-height: 100dvh;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      grid-template-areas: "bar" "banner" "main" "nav";
      background: var(--mw-bg); color: var(--mw-text); font-family: var(--mw-font);
    }
    header {
      grid-area: bar; display: flex; align-items: center; justify-content: space-between; gap: var(--mw-space-3);
      padding: calc(var(--mw-space-2) + var(--mw-safe-top)) calc(var(--mw-space-4) + var(--mw-safe-right)) var(--mw-space-2) calc(var(--mw-space-4) + var(--mw-safe-left));
      min-height: 3.5rem;
    }
    .brand { display: flex; align-items: center; gap: var(--mw-space-3); min-width: 0; }
    .logo { width: 2rem; height: 2rem; flex: none; }
    .logo svg { width: 100%; height: 100%; display: block; }
    h1 { margin: 0; font-size: var(--mw-text-lg); font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
    .rec-wrap { display: flex; align-items: center; gap: var(--mw-space-2); flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
    .rec {
      display: inline-flex; align-items: center; gap: var(--mw-space-2); min-height: var(--mw-touch-min);
      padding: 0 var(--mw-space-4) 0 var(--mw-space-3); border-radius: var(--mw-radius-full);
      background: var(--mw-surface-3); color: var(--mw-text); font-size: var(--mw-text-sm); font-weight: 700;
      transition: background var(--mw-transition), color var(--mw-transition), transform var(--mw-transition);
    }
    .rec:active { transform: scale(0.97); }
    .rec[data-state="monitoring"] { background: rgba(4,120,87,0.2); }
    .rec[data-state="recording"] { background: var(--mw-accent); color: var(--mw-on-accent); }
    .rec-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--mw-text-muted); flex: none; }
    .rec[data-state="monitoring"] .rec-dot { background: var(--mw-success); }
    .rec[data-state="recording"] .rec-dot { background: #fff; animation: rec-pulse 1.2s ease-in-out infinite; }
    .rec-sub { font-size: var(--mw-text-xs); font-weight: 600; color: var(--mw-warning); font-variant-numeric: tabular-nums; }
    @keyframes rec-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .banners { grid-area: banner; }
    .banner {  background: var(--mw-warning); color: #1a1200; font-size: var(--mw-text-sm); font-weight: 600; padding: var(--mw-space-2) var(--mw-space-4); text-align: center; }
    .panels { grid-area: main; position: relative; min-height: 0; }
    .panel { position: absolute; inset: 0; display: none; overflow: hidden; animation: fade 180ms ease-out; }
    .panel[active] { display: block; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    app-tabs { grid-area: nav; }

    .update-banner { background: var(--mw-info); color: #fff; }
    .update-banner button { margin-left: var(--mw-space-2); padding: 2px 12px; min-height: 28px; border-radius: var(--mw-radius-full); background: #fff; color: #111; font-weight: 700; }
    .toasts {
      position: fixed; left: 50%; bottom: calc(5.5rem + var(--mw-safe-bottom)); transform: translateX(-50%);
      display: flex; flex-direction: column; gap: var(--mw-space-2); align-items: center; z-index: 300; pointer-events: none; width: min(92vw, 28rem);
    }
    .toast {
      display: flex; align-items: center; gap: var(--mw-space-3); width: 100%; padding: var(--mw-space-3) var(--mw-space-4);
      border-radius: var(--mw-radius); background: var(--mw-text); color: var(--mw-bg); font-size: var(--mw-text-sm); font-weight: 600;
      box-shadow: var(--mw-shadow); animation: fade 180ms ease-out; pointer-events: auto;
    }
    .toast[data-kind="error"] { background: var(--mw-accent); color: #fff; }

    /* wide screens: navigation rail on the left */
    :host([wide]) {
      grid-template-columns: 6.25rem minmax(0, 1fr);
      grid-template-rows: auto auto minmax(0, 1fr);
      grid-template-areas: "nav bar" "nav banner" "nav main";
    }
    :host([wide]) .toasts { bottom: var(--mw-space-6); }

    /* "Buy me a coffee": plain external link, no third-party script or image is loaded */
    .coffee {
      position: fixed; right: calc(10px + var(--mw-safe-right)); bottom: calc(5rem + var(--mw-safe-bottom)); z-index: 50;
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
      background: #ffdd00; color: #000; font: 600 12px/1 var(--mw-font-sans, system-ui, sans-serif);
      text-decoration: none; box-shadow: 0 2px 8px rgb(0 0 0 / 0.25); opacity: 0.92;
    }
    .coffee:hover { opacity: 1; }
    .coffee:focus-visible { outline: 2px solid var(--mw-text, #fff); outline-offset: 2px; }
    .coffee svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    :host([wide]) .coffee { bottom: calc(18px + var(--mw-safe-bottom)); }
    /* discreet build stamp, bottom right */
    .version-stamp {
      position: fixed; right: calc(6px + var(--mw-safe-right)); bottom: calc(2px + var(--mw-safe-bottom)); z-index: 50;
      font: 500 9px/1 var(--mw-font-mono); letter-spacing: 0.02em; color: var(--mw-text-muted); opacity: 0.6;
      pointer-events: none; user-select: all; -webkit-user-select: all; white-space: nowrap;
    }
  </style>
  <header>
    <div class="brand"><span class="logo">${LOGO}</span><h1 class="app-title"></h1></div>
    <div class="rec-wrap">
      <span class="rec-sub" hidden></span>
      <button type="button" class="rec" aria-pressed="false"><span class="rec-dot" aria-hidden="true"></span><span class="rec-text"></span></button>
    </div>
  </header>
  <div class="banners">
    <div class="banner secure-banner" role="alert" hidden></div>
    <div class="banner update-banner" role="status" hidden><span class="update-text"></span> <button type="button" class="update-btn"></button></div>
  </div>
  <main class="panels">
    <div class="panel" id="panel-camera" role="tabpanel" aria-labelledby="tab-camera" data-panel="camera" active>
      <camera-monitor></camera-monitor>
    </div>
    <div class="panel" id="panel-recordings" role="tabpanel" aria-labelledby="tab-recordings" data-panel="recordings">
      <recording-list></recording-list>
    </div>
    <div class="panel" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" data-panel="settings">
      <motion-settings></motion-settings>
    </div>
  </main>
  <app-tabs></app-tabs>
  <div class="toasts" role="status" aria-live="polite"></div>
  <a class="coffee" href="https://www.buymeacoffee.com/netsi1964" target="_blank" rel="noopener noreferrer">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v3M12 2v3"/></svg>
    <span>Buy me a coffee</span>
  </a>
  <span class="version-stamp" aria-hidden="true"></span>
`;

/** Apply Settings → Theme to the document (and the browser UI colour). */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  else delete root.dataset.theme;
  const dark = theme === "dark" || (theme !== "light" && !matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0b0f" : "#f3f4f8");
}

export class MotionApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._unsub = null;
    this._unsubSettings = null;
    this._mq = null;
    this._cam = {};
  }

  connectedCallback() {
    // Apply saved language + theme
    const settings = getSettings();
    if (settings.language && settings.language !== getLocale()) setLocale(settings.language);
    applyTheme(settings.theme);
    this._unsubSettings = onSettingsChange((s) => applyTheme(s.theme));
    this._themeMq = matchMedia("(prefers-color-scheme: light)");
    this._themeMq.addEventListener?.("change", () => applyTheme(getSettings().theme));

    // Navigation rail on wide screens
    this._mq = matchMedia("(min-width: 900px)");
    this._applyWide = () => {
      this.toggleAttribute("wide", this._mq.matches);
      this.shadowRoot.querySelector("app-tabs")?.setAttribute("orientation", this._mq.matches ? "vertical" : "horizontal");
      this.shadowRoot.querySelector("app-tabs")?.setAttribute("aria-orientation", this._mq.matches ? "vertical" : "horizontal");
    };
    this._applyWide();
    this._mq.addEventListener?.("change", this._applyWide);

    this.shadowRoot.querySelector(".version-stamp").textContent = VERSION;
    this._render();
    this._unsub = onLocaleChange(() => this._render());

    const tabs = this.shadowRoot.querySelector("app-tabs");
    tabs?.addEventListener("tab-change", (e) => {
      const tab = /** @type {CustomEvent} */ (e).detail?.tab;
      this.shadowRoot.querySelectorAll(".panel").forEach((p) => {
        if (p.getAttribute("data-panel") === tab) p.setAttribute("active", "");
        else p.removeAttribute("active");
      });
      if (tab === "recordings") this.shadowRoot.querySelector("recording-list")?.refresh?.();
      if (tab === "settings") this.shadowRoot.querySelector("motion-settings")?._refreshStorage?.();
    });

    this.shadowRoot.querySelector("motion-settings")?.addEventListener("settings-changed", () => {
      this.shadowRoot.querySelector("camera-monitor")?.applySettings?.();
    });

    this.addEventListener("state-change", (e) => {
      this._cam = /** @type {CustomEvent} */ (e).detail || {};
      this._render();
    });
    // the camera component announced its first status before this listener existed: ask again
    this.shadowRoot.querySelector("camera-monitor")?._updateStatus?.();
    this.shadowRoot.querySelector(".rec")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("camera-monitor")?.toggleMonitor?.();
    });

    // Components announce things with `toast` events instead of alert()
    this.addEventListener("toast", (e) => {
      const d = /** @type {CustomEvent} */ (e).detail || {};
      this._toast(d.message, d.kind);
    });

    // The settings tab borrows the live camera stream to draw the detection area on
    this.addEventListener("request-stream", (e) => {
      const detail = /** @type {CustomEvent} */ (e).detail;
      if (detail) detail.stream = this.shadowRoot.querySelector("camera-monitor")?.liveStream?.() ?? null;
    });

    // a new version has been cached by the service worker: offer a reload (never reload by itself, a clip may be recording)
    this._onUpdate = () => {
      const b = /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".update-banner"));
      b.hidden = false;
      b.querySelector(".update-text").textContent = t("updateAvailable");
      b.querySelector(".update-btn").textContent = t("updateReload");
    };
    window.addEventListener("mw-update-available", this._onUpdate);
    this.shadowRoot.querySelector(".update-btn")?.addEventListener("click", () => location.reload());

    this._checkSecure();
    console.info("[MotionWatch] capabilities", fullCapabilityReport());
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsubSettings?.();
    this._mq?.removeEventListener?.("change", this._applyWide);
    window.removeEventListener("mw-update-available", this._onUpdate);
  }

  _toast(message, kind = "info") {
    if (!message) return;
    const box = this.shadowRoot.querySelector(".toasts");
    const el = document.createElement("div");
    el.className = "toast";
    el.dataset.kind = kind;
    el.textContent = message;
    box?.appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 6000 : 3500);
  }

  _render() {
    const title = this.shadowRoot.querySelector(".app-title");
    if (title) title.textContent = t("appName");
    const rec = this.shadowRoot.querySelector(".rec");
    const sub = /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".rec-sub"));
    const c = this._cam || {};
    if (rec) {
      const state = c.recording ? "recording" : c.monitoring ? "monitoring" : "idle";
      rec.setAttribute("data-state", state);
      rec.setAttribute("aria-pressed", String(state !== "idle"));
      rec.setAttribute("aria-label", state === "idle" ? t("a11yMonitorStart") : t("a11yMonitorStop"));
      const txt = rec.querySelector(".rec-text");
      if (txt) txt.textContent = state === "recording" ? t("statusRecording") : state === "monitoring" ? t("statusMonitoring") : t("monitorNow");
    }
    if (sub) {
      // countdown wins, then pause, then the schedule line (which one waits / runs and when)
      const text = c.countdown != null ? t("stopsIn", { s: c.countdown }) : c.paused ? t("statusPaused") : (c.scheduleText || (c.waiting ? t("statusWaiting") : ""));
      sub.hidden = !text;
      sub.textContent = text;
    }
  }

  _checkSecure() {
    const banner = this.shadowRoot.querySelector(".secure-banner");
    if (!banner) return;
    if (!isSecureContext() || !hasGetUserMedia()) {
      /** @type {HTMLElement} */ (banner).hidden = false;
      banner.textContent = t("secureContextRequired");
    } else {
      /** @type {HTMLElement} */ (banner).hidden = true;
    }
  }
}

customElements.define("motion-app", MotionApp);
