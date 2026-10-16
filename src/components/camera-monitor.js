import { t, onLocaleChange, getLocale } from "../services/i18n.js";
import { getSettings, updateSettings, onSettingsChange } from "../services/settings.js";
import { evaluate as evaluateSchedules } from "../services/schedule.js";
import { MotionDetector } from "../services/motion.js";
import { overlaySvg, bbox, colorFor } from "../services/areas.js";
import { RecorderService } from "../services/recorder.js";
import { hasWakeLock } from "../services/capabilities.js";
import { saveRecording } from "../services/storage.js";
import { SoundDetector, unlockAudio } from "../services/sound.js";
import { sharedCss, syncRange } from "../styles/shared.js";
import { icon } from "./icons.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host { display: block; height: 100%; container-type: size; background: var(--mw-bg); }
    .layout {
      height: 100%; display: flex; flex-direction: column; gap: var(--mw-space-3);
      padding: 0 0 var(--mw-space-3);
    }
    .stage-wrap { flex: 1; min-height: 0; display: flex; }
    .preview-wrap {
      position: relative; flex: 1; min-height: 0; background: #000; overflow: hidden;
    }
    /* absolutely positioned: Safari resolves percentage heights inside flex items unreliably */
    video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
    /* canvas preview: same box as the video, used where the <video> does not paint (some Safari versions) */
    .preview-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
    .areas-box { position: absolute; pointer-events: none; display: none; }
    .areas-box .label[data-hot] { box-shadow: 0 0 0 2px #fff; }
    .areas-box .label::before { content: "● "; display: none; }
    .areas-box .label[data-hot]::before { display: inline; }
    .areas-box .label {
      position: absolute; transform: translate(0, -100%); white-space: nowrap; max-width: 60%;
      overflow: hidden; text-overflow: ellipsis; font-size: var(--mw-text-xs); font-weight: 700;
      padding: 1px 7px; border-radius: 6px 6px 6px 0; color: #000;
    }

    .overlay-ui {
      position: absolute; inset: 0; pointer-events: none; display: flex; flex-direction: column;
      justify-content: space-between; padding: var(--mw-space-3);
    }
    .top-bar, .bottom-bar { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mw-space-2); }
    .bottom-bar { align-items: flex-end; }
    .top-left { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mw-space-1); min-width: 0; }
    .note { font-size: var(--mw-text-xs); font-weight: 600; color: var(--mw-on-dark); background: rgba(0,0,0,0.62); padding: 0.2rem 0.65rem; border-radius: var(--mw-radius-full); max-width: 100%; }
    .clock-preview { font-family: var(--mw-font-mono); font-size: var(--mw-text-xs); font-weight: 600; color: var(--mw-on-dark); background: rgba(0,0,0,0.62); padding: 0.2rem 0.65rem; border-radius: var(--mw-radius-full); }
    .clock-preview:empty { display: none; }

    .hud { display: flex; flex-direction: column; gap: 6px; padding: 0.55rem 0.75rem; border-radius: var(--mw-radius); background: rgba(0,0,0,0.62); color: var(--mw-on-dark); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
    .mrow { display: flex; align-items: center; gap: var(--mw-space-2); font-size: var(--mw-text-xs); font-weight: 600; }
    .mlabel { min-width: 3.4rem; opacity: 0.85; }
    .meter { position: relative; height: 8px; width: min(42vw, 180px); background: rgba(255,255,255,0.22); border-radius: var(--mw-radius-full); overflow: hidden; }
    .meter::after { content: ""; position: absolute; top: 0; bottom: 0; left: var(--tick, 50%); width: 2px; background: #fff; }
    .meter-fill { height: 100%; width: 0%; background: var(--mw-meter-low); transition: width 90ms linear, background 150ms; border-radius: inherit; }

    .countdown {
      position: absolute; top: var(--mw-space-3); left: 50%; transform: translateX(-50%); z-index: 1; pointer-events: none;
      display: inline-flex; align-items: center; gap: var(--mw-space-2); white-space: nowrap;
      background: #b45309; color: #fff; font-weight: 700; font-size: var(--mw-text-base);
      padding: 0.35rem 0.9rem; border-radius: var(--mw-radius-full); font-variant-numeric: tabular-nums; box-shadow: var(--mw-shadow);
    }
    .tap-play { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: var(--mw-space-2); background: rgba(0,0,0,0.55); color: #fff; font-size: var(--mw-text-lg); font-weight: 700; padding: var(--mw-space-4); }

    .privacy {
      position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: var(--mw-space-3); padding: var(--mw-space-6); text-align: center; background: var(--mw-bg);
    }
    .privacy-ico { display: grid; place-items: center; width: 4.5rem; height: 4.5rem; border-radius: 50%; background: var(--mw-accent-soft); color: var(--mw-accent); }
    .privacy-ico .ico { width: 2.1rem; height: 2.1rem; }
    .privacy h2 { margin: 0; font-size: var(--mw-text-xl); letter-spacing: -0.02em; max-width: 26rem; }
    .privacy p { margin: 0; color: var(--mw-text-muted); max-width: 26rem; }
    .privacy .sched-line { font-size: var(--mw-text-sm); font-weight: 600; color: var(--mw-info); }
    .privacy .btn { margin-top: var(--mw-space-2); min-height: 3rem; padding: 0 var(--mw-space-6); font-size: var(--mw-text-base); }

    /* ---- control dock ---- */
    .dock { margin: 0 var(--mw-space-3); padding: var(--mw-space-3) var(--mw-space-4) var(--mw-space-4); display: flex; flex-direction: column; gap: var(--mw-space-3); }
    .dock-row { display: flex; align-items: flex-start; justify-content: center; gap: var(--mw-space-6); }
    .dock-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 4.5rem; color: var(--mw-text); font-size: var(--mw-text-xs); font-weight: 600; }
    .dock-btn .dock-ico { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; border-radius: 50%; background: var(--mw-surface-3); transition: background var(--mw-transition), transform var(--mw-transition); }
    .dock-btn .dock-ico .ico { width: 1.5rem; height: 1.5rem; }
    .dock-btn:hover:not(:disabled) .dock-ico { background: var(--mw-border-strong); }
    .dock-btn:active:not(:disabled) .dock-ico { transform: scale(0.94); }
    .dock-btn:disabled { opacity: 0.45; }
    .dock-label { max-width: 6rem; text-align: center; line-height: 1.2; }
    .toggle-btn.on .dock-ico, .audio-btn.on .dock-ico { background: rgba(4,120,87,0.18); color: var(--mw-success); }
    .dock-state { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 1px 8px; border-radius: var(--mw-radius-full); background: var(--mw-surface-3); color: var(--mw-text-muted); }
    .dock-btn.on .dock-state { background: rgba(4,120,87,0.2); color: var(--mw-success); }
    .smeter.no-trigger::after { display: none; }
    .sound-db { font-variant-numeric: tabular-nums; min-width: 4.2ch; text-align: right; opacity: 0.85; }
    /* the big monitor toggle: accent = off/paused, green = monitoring, red = recording a clip */
    .shutter .dock-ico { width: 4.75rem; height: 4.75rem; background: transparent; border: 4px solid var(--mw-text); position: relative; }
    .shutter .dock-ico::before {
      content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--mw-accent);
      transition: background var(--mw-transition);
    }
    .shutter .dock-ico .ico { position: relative; width: 1.7rem; height: 1.7rem; color: #fff; }
    .shutter.monitoring .dock-ico::before { background: #047857; }
    .shutter.recording .dock-ico::before { background: var(--mw-accent); animation: shutter-pulse 1.2s ease-in-out infinite; }
    @keyframes shutter-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .shutter:hover:not(:disabled) .dock-ico { background: transparent; }
    .tune { display: flex; flex-direction: column; gap: var(--mw-space-2); }
    .sens { display: grid; grid-template-columns: 1fr auto; gap: 0 var(--mw-space-3); align-items: center; font-size: var(--mw-text-sm); font-weight: 600; }
    .sens .sens-val { font-variant-numeric: tabular-nums; color: var(--mw-text-muted); min-width: 2.6ch; text-align: right; }
    .sens input { grid-column: 1 / -1; }
    .info-line { display: flex; flex-wrap: wrap; gap: var(--mw-space-1) var(--mw-space-3); font-size: var(--mw-text-xs); color: var(--mw-text-muted); justify-content: center; }
    .notice { margin: 0 var(--mw-space-3); color: var(--mw-warning); font-size: var(--mw-text-sm); font-weight: 600; text-align: center; }
    .error-msg { margin: 0 var(--mw-space-3); color: var(--mw-danger-text); font-size: var(--mw-text-sm); font-weight: 600; text-align: center; }

    /* wide screens and landscape phones: picture left, dock right */
    @container (min-width: 880px) {
      .layout { flex-direction: row; padding: var(--mw-space-3); gap: var(--mw-space-4); }
      .stage-wrap .preview-wrap { border-radius: var(--mw-radius-lg); }
      .dock { margin: 0; width: min(21rem, 38%); flex: none; overflow-y: auto; justify-content: center; }
      .dock-row { gap: var(--mw-space-4); }
      .notice, .error-msg { margin: 0; }
    }
    @container (max-height: 480px) and (min-width: 560px) {
      .layout { flex-direction: row; padding: var(--mw-space-3); gap: var(--mw-space-4); }
      .stage-wrap .preview-wrap { border-radius: var(--mw-radius-lg); }
      .dock { margin: 0; width: min(21rem, 38%); flex: none; overflow-y: auto; justify-content: center; }
      .dock-row { gap: var(--mw-space-4); }
      .notice, .error-msg { margin: 0; }
    }
    @container (max-height: 480px) {
      .dock-btn .dock-ico { width: 3rem; height: 3rem; }
      .shutter .dock-ico { width: 4rem; height: 4rem; }
    }
    @container (min-width: 560px) and (min-height: 481px) and (max-width: 879px) {
      .stage-wrap { padding: 0 var(--mw-space-3); }
      .stage-wrap .preview-wrap { border-radius: var(--mw-radius-lg); }
    }
  </style>
  <div class="layout">
    <div class="stage-wrap">
      <div class="preview-wrap">
        <video playsinline muted autoplay></video>
        <canvas class="preview-canvas" aria-hidden="true" hidden></canvas>
        <div class="areas-box" aria-hidden="true"></div>
        <div class="overlay-ui">
          <div class="top-bar">
            <div class="top-left">
              <status-indicator state="idle"></status-indicator>
              <span class="note" hidden></span>
            </div>
            <span class="clock-preview" aria-hidden="true"></span>
          </div>
          <div class="bottom-bar">
            <div class="hud">
              <div class="mrow">
                <span class="mlabel motion-label"></span>
                <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="meter-fill"></div></div>
              </div>
              <div class="mrow sound-row" hidden>
                <span class="mlabel sound-label"></span>
                <div class="meter smeter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="meter-fill smeter-fill"></div></div>
                <span class="sound-db" aria-hidden="true"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="countdown" role="timer" aria-live="off" hidden></div>
        <button type="button" class="tap-play" hidden></button>
        <div class="privacy" hidden>
          <span class="privacy-ico">${icon("camera")}</span>
          <h2></h2>
          <p></p>
          <p class="sched-line" hidden></p>
          <button type="button" class="btn btn-primary grant-btn"></button>
        </div>
      </div>
    </div>

    <div class="dock card">
      <div class="dock-row">
        <button type="button" class="dock-btn toggle-btn"></button>
        <button type="button" class="dock-btn audio-btn" aria-pressed="false"></button>
        <button type="button" class="dock-btn shutter monitor-btn" aria-pressed="false"></button>
      </div>
      <div class="tune">
        <label class="sens"><span class="sens-text"></span><span class="sens-val" aria-hidden="true"></span><input type="range" class="sens-range" min="0" max="100" step="1"></label>
        <label class="sens sound-sens" hidden><span class="ssens-text"></span><span class="ssens-val" aria-hidden="true"></span><input type="range" class="ssens-range" min="0" max="100" step="1"></label>
        <select class="camera-select" hidden aria-label=""></select>
      </div>
      <div class="info-line"><span class="detect"></span><span class="wake"></span><span class="audio-tag" hidden></span></div>
      <div class="notice" role="status" hidden></div>
      <div class="error-msg" role="alert" hidden></div>
    </div>
  </div>
`;

export class CameraMonitor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    /** @type {RecorderService} */
    this.recorder = new RecorderService();
    /** @type {MotionDetector} */
    this.motion = new MotionDetector();
    this.motion.onBackendChange = () => this._renderDetect();
    /** @type {string} */
    this.state = "idle"; // idle | requesting | monitoring | recording | saving | error
    /** @type {number | null} */
    this._motionLoop = null;
    /** @type {number | null} */
    this._quietTimer = null;
    /** @type {number} */
    this._lastMotionAt = 0;
    /** @type {WakeLockSentinel | null} */
    this._wakeLock = null;
    this._unsubLocale = null;
    this._started = false;
    this._paused = false;
    /** Monitor now: arm even outside the schedule */
    this._override = false;
    /** @type {number | null} seconds until auto-stop */
    this._countdown = null;
    this._schedule = { restricted: false, active: true, names: [], until: null, next: null, nextName: "" };
    this._schedAt = 0;
    this._settings = getSettings();
    this._audioWanted = false;
    this.sound = new SoundDetector();
    this._soundScore = 0;
    this._restartPending = false;
  }

  connectedCallback() {
    // unlock audio on the first tap / key press (browsers keep audio contexts suspended until then)
    this._unlock = () => unlockAudio();
    document.addEventListener("pointerdown", this._unlock, true);
    document.addEventListener("keydown", this._unlock, true);
    const video = this.shadowRoot.querySelector("video");
    this.recorder.attachPreview(/** @type {HTMLVideoElement} */ (video));
    this.recorder.onStateChange = (s) => this._setState(s);
    this.recorder.onRecordingComplete = (blob, meta) => this._onComplete(blob, meta);
    this.recorder.onError = (err) => this._showError(err.message);

    this._bindUI();
    this._render();
    this._syncSensitivity();
    /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".sound-sens")).hidden = !getSettings().soundTrigger;
    this._unsubSettings = onSettingsChange((s) => { this._settings = s; this._syncSensitivity(); });
    this.motion.setAreas(getSettings().detectionAreas);
    this._ro = new ResizeObserver(() => this._layoutRegion());
    this._ro.observe(this.shadowRoot.querySelector(".preview-wrap"));
    video.addEventListener("loadedmetadata", () => this._layoutRegion());
    this._unsubLocale = onLocaleChange(() => this._render());

    // Show privacy gate until user starts
    this._showPrivacy(true);

    // schedule info is useful before the camera is on: evaluate now and keep it fresh
    this._refreshSchedule(true);
    this._updateStatus();
    this._schedTimer = setInterval(() => { if (!this._started) { this._refreshSchedule(true); this._updateStatus(); } }, 30_000);
  }

  disconnectedCallback() {
    clearInterval(this._schedTimer);
    document.removeEventListener("pointerdown", this._unlock, true);
    document.removeEventListener("keydown", this._unlock, true);
    this._unsubLocale?.();
    this._unsubSettings?.();
    this._ro?.disconnect();
    this._stopAll();
  }

  /** Reflect the stored sensitivity in the slider (also when changed in Settings). */
  _syncSensitivity() {
    const s = getSettings().sensitivity;
    const range = /** @type {HTMLInputElement | null} */ (this.shadowRoot.querySelector(".sens-range"));
    if (range && range.value !== String(s)) range.value = String(s);
    const val = this.shadowRoot.querySelector(".sens-val");
    if (val) val.textContent = String(s);
    if (range) syncRange(range);
    this.motion.setSensitivity(s);

    const ss = getSettings().soundSensitivity;
    const srange = /** @type {HTMLInputElement | null} */ (this.shadowRoot.querySelector(".ssens-range"));
    if (srange && srange.value !== String(ss)) srange.value = String(ss);
    const sval = this.shadowRoot.querySelector(".ssens-val");
    if (sval) sval.textContent = String(ss);
    if (srange) syncRange(srange);
    this.sound.setSensitivity(ss);
    this._placeSoundTick();
  }

  /** Position the trigger tick on the sound meter. */
  _placeSoundTick() {
    /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".smeter"))?.style.setProperty("--tick", `${this.sound.thresholdLevel()}%`);
  }

  /** Dock button: icon + label, updated in place so keyboard focus survives. */
  _dock(btn, name, label, state) {
    if (!btn) return;
    if (!btn.querySelector(".dock-label")) btn.innerHTML = '<span class="dock-ico"></span><span class="dock-label"></span><span class="dock-state" hidden></span>';
    const ico = btn.querySelector(".dock-ico");
    if (ico.dataset.icon !== name) { ico.dataset.icon = name; ico.innerHTML = icon(name); }
    btn.querySelector(".dock-label").textContent = label;
    const chip = /** @type {HTMLElement} */ (btn.querySelector(".dock-state"));
    chip.hidden = state === undefined;
    if (state !== undefined) chip.textContent = state;
  }

  _bindUI() {
    this.shadowRoot.querySelector(".sens-range")?.addEventListener("input", (e) => {
      updateSettings({ sensitivity: Number(/** @type {HTMLInputElement} */ (e.target).value) });
    });
    this.shadowRoot.querySelector(".ssens-range")?.addEventListener("input", (e) => {
      updateSettings({ soundSensitivity: Number(/** @type {HTMLInputElement} */ (e.target).value) });
    });
    const grant = this.shadowRoot.querySelector(".grant-btn");
    const toggle = this.shadowRoot.querySelector(".toggle-btn");
    grant?.addEventListener("click", () => this.startMonitoring());
    toggle?.addEventListener("click", () => {
      if (this.state === "idle" || this.state === "error") {
        this.startMonitoring();
      } else {
        this.stopMonitoring();
      }
    });

    this.shadowRoot.querySelector(".monitor-btn")?.addEventListener("click", () => this.toggleMonitor());
    this.shadowRoot.querySelector(".audio-btn")?.addEventListener("click", () => {
      updateSettings({ recordAudio: !getSettings().recordAudio });
      this.applySettings();
    });
    this.shadowRoot.querySelector(".tap-play")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("video")?.play().catch(() => {});
    });
    this.shadowRoot.querySelector("video")?.addEventListener("playing", () => {
      /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".tap-play")).hidden = true;
    });

    const select = this.shadowRoot.querySelector(".camera-select");
    select?.addEventListener("change", async (e) => {
      const id = /** @type {HTMLSelectElement} */ (e.target).value || null;
      // restart with new device
      if (this._started) {
        await this.stopMonitoring();
        // settings update is external; for now pass deviceId
        await this.startMonitoring(id);
      }
    });
  }

  _showPrivacy(show) {
    const el = this.shadowRoot.querySelector(".privacy");
    const video = this.shadowRoot.querySelector("video");
    if (el) el.hidden = !show;
    if (video) video.style.visibility = show ? "hidden" : "visible";
  }

  _render() {
    const privacyH = this.shadowRoot.querySelector(".privacy h2");
    const privacyP = this.shadowRoot.querySelector(".privacy p");
    const grant = this.shadowRoot.querySelector(".grant-btn");
    const toggle = this.shadowRoot.querySelector(".toggle-btn");
    const meter = this.shadowRoot.querySelector(".meter");

    if (privacyH) privacyH.textContent = t("privacyTitle");
    if (privacyP) privacyP.textContent = t("privacyBody");
    if (grant) grant.textContent = t("grantCamera");
    if (toggle) {
      const active = this.state !== "idle" && this.state !== "error";
      const camOn = this._started || this.state === "requesting";
      this._dock(toggle, camOn ? "camera" : "cameraOff", t("cameraLabel"), camOn ? t("stateOn") : t("stateOff"));
      toggle.classList.toggle("on", camOn);
      toggle.setAttribute("aria-pressed", String(camOn));
      toggle.title = camOn ? t("cameraOnHint") : t("cameraOffHint");
    }
    if (meter) meter.setAttribute("aria-label", t("a11yMotionMeter"));
    this.shadowRoot.querySelector(".smeter")?.setAttribute("aria-label", t("a11ySoundMeter"));
    this.shadowRoot.querySelector(".motion-label").textContent = t("meterMotion");
    this.shadowRoot.querySelector(".sound-label").textContent = t("meterSound");
    this.shadowRoot.querySelector(".ssens-text").textContent = t("soundSensitivity");
    this.shadowRoot.querySelector(".ssens-range")?.setAttribute("aria-label", t("soundSensitivity"));
    const st = this.shadowRoot.querySelector(".sens-text");
    if (st) st.textContent = t("sensitivity");
    this.shadowRoot.querySelector(".sens-range")?.setAttribute("aria-label", t("sensitivity"));
    this.shadowRoot.querySelector("video")?.setAttribute("aria-label", t("a11yCameraPreview"));

    const select = this.shadowRoot.querySelector(".camera-select");
    if (select) select.setAttribute("aria-label", t("selectCamera"));

    const tp = this.shadowRoot.querySelector(".tap-play");
    if (tp) tp.textContent = t("tapToPlay");
    this._renderDetect();
    this._updateWakeLabel();
    this._updateStatus();
  }

  _renderDetect() {
    const el = this.shadowRoot.querySelector(".detect");
    if (el) el.textContent = !this._started ? "" : this.motion.backend === "gpu" ? t("detectionGpu") : t("detectionCpu");
  }

  _setState(state) {
    this.state = state;
    if (state !== "recording" && state !== "saving") this._countdown = null;
    this._render();
  }

  _armed() {
    return !this._paused && (this._schedule.active || this._override);
  }

  /** `Mon 22:00` style label for a Date, or just the time when it is today. */
  _when(date) {
    if (!date) return "";
    const tag = getLocale() === "zh-Hans" ? "zh-CN" : getLocale();
    const same = date.toDateString() === new Date().toDateString();
    const far = date.getTime() - Date.now() > 6 * 86400000;   // a one-off window can be weeks away
    return new Intl.DateTimeFormat(tag, same
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, ...(far ? { day: "numeric", month: "short" } : {}) }).format(date);
  }

  /** Re-evaluate the schedules (at most once a second). Returns true if arming changed. */
  _refreshSchedule(force = false) {
    const now = Date.now();
    if (!force && now - this._schedAt < 1000) return false;
    this._schedAt = now;
    const prev = this._schedule;
    this._schedule = evaluateSchedules(this._settings.schedules);
    const changed = prev.active !== this._schedule.active || prev.names.join() !== this._schedule.names.join();
    if (changed) {
      // A schedule starting wins over a pause: monitoring resumes by itself. Pausing inside the
      // window afterwards sticks, because this only fires when the window begins.
      if (!prev.active && this._schedule.active && this._started && this._paused) {
        this._paused = false;
        this.motion.reset();
        this.dispatchEvent(new CustomEvent("toast", { bubbles: true, composed: true, detail: { message: t("scheduleResumed", { name: this._schedule.names.join(", ") }) } }));
      }
      this._updateStatus();
    }
    return changed;
  }

  /** One line about the schedule: which one runs / waits and when ("Schedule “Night” · starts 22:00"). */
  _scheduleText() {
    const sc = this._schedule;
    if (!sc.restricted) return "";
    return sc.active
      ? t("noteInWindow", { name: sc.names.join(", "), from: this._when(sc.from), until: this._when(sc.until) })
      : sc.next ? t("noteWaiting", { name: sc.nextName, next: this._when(sc.next), until: this._when(sc.nextUntil) })
      : t("scheduleNoUpcoming");
  }

  /** Sync indicator, note, buttons and tell the app header. */
  _updateStatus() {
    const q = (s) => /** @type {HTMLElement} */ (this.shadowRoot.querySelector(s));
    const live = this._started && this.state !== "idle" && this.state !== "error" && this.state !== "requesting";
    const recording = this.state === "recording";
    let ind = this.state;
    const idleLike = this.state === "monitoring";
    const paused = live && this._paused;
    const waiting = live && !this._armed() && !this._paused;
    const monitoring = live && this._armed();
    if (idleLike && paused) ind = "paused";
    else if (idleLike && waiting) ind = "waiting";
    q("status-indicator").setAttribute("state", ind);

    // note under the status indicator
    let note = "";
    if (live) {
      if (paused) note = "";
      else if (waiting) note = this._scheduleText();
      else if (this._override && this._schedule.restricted && !this._schedule.active) note = t("noteOverride");
      else if (this._schedule.restricted) note = this._scheduleText();
    }
    const noteEl = q(".note");
    noteEl.hidden = !note;
    noteEl.textContent = note;

    const monBtn = /** @type {HTMLButtonElement} */ (q(".monitor-btn"));
    this._dock(monBtn, monitoring ? "pause" : "eye", monitoring ? t("pause") : t("monitorNow"));
    monBtn.setAttribute("aria-pressed", String(monitoring));
    monBtn.classList.toggle("monitoring", monitoring && !recording);
    monBtn.classList.toggle("recording", recording);
    monBtn.disabled = this.state === "requesting" || this.state === "saving";

    const audioBtn = /** @type {HTMLButtonElement} */ (q(".audio-btn"));
    const wantAudio = this._settings.recordAudio;
    this._dock(audioBtn, wantAudio ? "mic" : "micOff", t("audioBtn"), wantAudio ? t("stateOn") : t("stateOff"));
    audioBtn.setAttribute("aria-pressed", String(wantAudio));
    audioBtn.classList.toggle("on", wantAudio);
    audioBtn.title = wantAudio ? t("audioOnHint") : t("audioOffHint");

    const gate = q(".sched-line");
    gate.textContent = this._scheduleText();
    gate.hidden = !gate.textContent;

    const cd = q(".countdown");
    cd.hidden = this._countdown == null;
    if (this._countdown != null) cd.textContent = t("stopsIn", { s: this._countdown });

    const tag = q(".audio-tag");
    tag.hidden = !(live && this.recorder.hasAudio);
    tag.textContent = `🎙 ${t("audioOn")}`;

    this.dispatchEvent(new CustomEvent("state-change", {
      detail: { state: this.state, recording, monitoring, override: this._override, countdown: this._countdown, paused, waiting, live, scheduleText: this._scheduleText() },
      bubbles: true,
      composed: true,
    }));
  }

  _setCountdown(n) {
    if (n === this._countdown) return;
    this._countdown = n;
    this._updateStatus();
  }

  _notice(msg) {
    const el = /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".notice"));
    el.textContent = msg;
    el.hidden = !msg;
  }

  /**
   * "Monitor now" / "Pause": the big button and the header pill.
   * Monitoring means watching for motion/sound and recording clips when triggered; a schedule
   * decides when that happens automatically, this overrides it until paused.
   */
  async toggleMonitor() {
    if (!this._started) {
      await this.startMonitoring();
      if (!this._started) return;
      this._paused = false;
      this._refreshSchedule(true);
      if (!this._schedule.active) this._override = true;
      this._updateStatus();
      return;
    }
    if (this._armed()) {
      this._paused = true;
      this._override = false;
      if (this.state === "recording") this.recorder.stopRecording(false);
      this._setCountdown(null);
      this._updateMeter(0);
    } else {
      this._paused = false;
      if (!this._schedule.active) this._override = true;
      this.motion.reset();
    }
    this._updateStatus();
  }

  _showError(msg) {
    const el = this.shadowRoot.querySelector(".error-msg");
    if (el) {
      el.textContent = msg;
      el.hidden = !msg;
    }
    if (msg) this._setState("error");
  }

  async startMonitoring(deviceId = null) {
    unlockAudio(); // still inside the user gesture that started the camera
    this._showError("");
    const hadFocus = this.shadowRoot.activeElement?.classList.contains("grant-btn");
    this._showPrivacy(false);
    if (hadFocus) /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".toggle-btn"))?.focus();
    this._setState("requesting");

    const settings = getSettings();
    this.motion.setSensitivity(settings.sensitivity);
    this.motion.reset();

    try {
      await this.recorder.startCamera({
        deviceId: deviceId || settings.selectedDeviceId,
        quality: settings.videoQuality,
        audio: settings.recordAudio || settings.soundTrigger,
      });
    } catch (err) {
      this._showPrivacy(true);
      this._showError(err?.name === "NotAllowedError" ? t("cameraDenied") : (err?.message || t("errorGeneric")));
      return;
    }

    this.motion.init(); // pick GPU/CPU now so the label is right even while waiting for a schedule
    this._started = true;
    this._audioWanted = settings.recordAudio || settings.soundTrigger;
    this.recorder.includeAudio = settings.recordAudio && this.recorder.hasAudio;
    this._attachSound(settings);
    this._paused = this._restoreState?.paused ?? false;
    this._override = this._restoreState?.override ?? false;
    this._notice((settings.recordAudio || settings.soundTrigger) && this.recorder.audioFailed ? t("audioDenied") : "");
    this._refreshSchedule(true);
    this._setState("monitoring");
    // Safari may refuse to autoplay the stream: offer a tap-to-start overlay
    setTimeout(() => {
      const v = this.shadowRoot.querySelector("video");
      if (v && this._started && v.paused) /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".tap-play")).hidden = false;
    }, 800);
    this._populateCameras();
    this._startMotionLoop();
    if (settings.keepAwake) this._requestWakeLock();

    // Settings can change while the camera is starting (e.g. Sound tapped right after Camera):
    // the stream was opened with the old ones, so reconcile once it is up.
    const now = getSettings();
    const needMic = now.recordAudio || now.soundTrigger;
    if (needMic !== this._audioWanted && !(needMic && this.recorder.audioFailed)) this._restartPending = true;
    else this.applySettings();
  }

  async stopMonitoring() {
    this._stopMotionLoop();
    this._clearQuietTimer();
    this.recorder.stopCamera();
    this._releaseWakeLock();
    this._started = false;
    this.sound.detach();
    {
      const c = /** @type {HTMLCanvasElement} */ (this.shadowRoot.querySelector(".preview-canvas"));
      c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }
    /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".sound-row")).hidden = true;
    this._paused = false;
    this._override = false;
    this._countdown = null;
    this._notice("");
    /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".tap-play")).hidden = true;
    this._setState("idle");
    this._updateMeter(0);
  }

  _stopAll() {
    this.stopMonitoring();
    this.motion.dispose();
  }

  _startMotionLoop() {
    this._stopMotionLoop();

    const tick = () => {
      const video = /** @type {HTMLVideoElement | null} */ (this.shadowRoot.querySelector("video"));
      if (!video || !this._started) return;

      // read live so changes in Settings apply without restarting
      const s = this._settings;
      const quietMs = (s.quietPeriodSec || 5) * 1000;
      const maxClipMs = (s.maxClipMinutes || 0) * 60 * 1000;
      const now = performance.now();

      if (this._restartPending && this.state === "monitoring") {
        this._restartPending = false;
        this._restart();
        return;
      }
      this._paintPreview(video);
      this._refreshSchedule();
      const armed = this._armed();

      let score = 0;
      let isMot = false;
      if (armed) {
        score = this.motion.analyze(video);
        isMot = this.motion.isMotion(score);
        this._flagHot(this.motion.hot);
      } else if (this._wasArmed) {
        this.motion.reset();
      }
      this._wasArmed = armed;
      this._updateMeter(score);

      // Sound is read even while disarmed so the meter works for calibrating; it only triggers when armed
      let isSound = false;
      if (this.sound.active) {
        const hit = this.sound.poll(now);
        isSound = armed && this._settings.soundTrigger && hit;
        this._updateSoundMeter();
      }
      if (now - (this._audioHintAt || 0) > 500) { this._audioHintAt = now; if (this.sound.active) this._syncAudioNotice(); }
      const trig = isMot || isSound;

      if (trig) {
        this._lastMotionAt = now;
        if (this.state === "monitoring") this.recorder.startRecording();
      }
      if (this.state === "recording") this.recorder.offerPoster(Math.max(score, isSound ? 60 : 0));

      let countdown = null;
      if (this.state === "recording") {
        if (!armed) {
          this.recorder.stopRecording(false);
        } else if (!trig) {
          const remaining = quietMs - (now - this._lastMotionAt);
          if (remaining <= 0) this.recorder.stopRecording(false);
          else countdown = Math.ceil(remaining / 1000);
        }
        if (maxClipMs > 0) {
          const remMax = maxClipMs - (now - this.recorder.recordingStart);
          if (remMax <= 0) this.recorder.stopRecording(false);
          else if (remMax <= 10000) countdown = Math.min(countdown ?? Infinity, Math.ceil(remMax / 1000));
        }
      }
      this._setCountdown(countdown);

      // Update live clock preview
      const clockEl = this.shadowRoot.querySelector(".clock-preview");
      if (clockEl && this.recorder._clockText) {
        clockEl.textContent = this.recorder._clockText;
      }

      this._motionLoop = requestAnimationFrame(tick);
    };
    this._wasArmed = true;
    this._motionLoop = requestAnimationFrame(tick);
  }

  /** Mark the detection areas that are triggering right now. */
  _flagHot(ids) {
    const key = ids.join();
    if (key === this._hotKey) return;
    this._hotKey = key;
    this.shadowRoot.querySelectorAll(".areas-box .label[data-id]").forEach((el) => {
      /** @type {HTMLElement} */ (el).toggleAttribute("data-hot", ids.includes(/** @type {HTMLElement} */ (el).dataset.id));
    });
  }

  /** Canvas preview in WebKit (or when chosen in Settings): copy each video frame onto a visible canvas. */
  _canvasPreview() {
    const mode = this._settings.preview;
    if (mode === "canvas") return true;
    if (mode === "video") return false;
    const ua = navigator.userAgent;
    return (/AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|Android/.test(ua)) || /iPad|iPhone|iPod/.test(ua);
  }

  _paintPreview(video) {
    const canvas = /** @type {HTMLCanvasElement} */ (this.shadowRoot.querySelector(".preview-canvas"));
    const on = this._canvasPreview();
    if (canvas.hidden === on) {
      canvas.hidden = !on;
      video.style.opacity = on ? "0" : "";
    }
    if (!on || video.readyState < 2 || !video.videoWidth) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  async _restart() {
    // keep the user's pause / "monitor now" choice across the camera restart (applied inside
    // startMonitoring, so there is no moment where a paused app is armed)
    this._restoreState = { paused: this._paused, override: this._override };
    await this.stopMonitoring();
    this._paused = this._restoreState.paused;       // stopMonitoring cleared them: put them back at once
    this._override = this._restoreState.override;
    await this.startMonitoring();
    this._restoreState = null;
  }

  _stopMotionLoop() {
    if (this._motionLoop != null) {
      cancelAnimationFrame(this._motionLoop);
      this._motionLoop = null;
    }
  }

  _clearQuietTimer() {
    if (this._quietTimer != null) {
      clearTimeout(this._quietTimer);
      this._quietTimer = null;
    }
  }

  _updateMeter(score) {
    const fill = this.shadowRoot.querySelector(".meter-fill");
    const meter = this.shadowRoot.querySelector(".meter");
    if (fill) {
      fill.style.width = `${Math.min(100, score)}%`;
      if (score > 60) fill.style.background = "var(--mw-meter-high)";
      else if (score > 30) fill.style.background = "var(--mw-meter-mid)";
      else fill.style.background = "var(--mw-meter-low)";
    }
    if (meter) meter.setAttribute("aria-valuenow", String(Math.round(score)));
  }

  async _onComplete(blob, meta) {
    try {
      await saveRecording({
        blob,
        durationSec: meta.durationSec,
        mimeType: meta.mimeType,
        sizeBytes: blob.size,
        width: meta.width,
        height: meta.height,
        poster: meta.poster,
        hasAudio: meta.hasAudio,
        createdAt: Date.now(),
      });
      this.dispatchEvent(new CustomEvent("recording-saved", {
        detail: { size: blob.size },
        bubbles: true,
        composed: true,
      }));
    } catch (err) {
      this._showError(t("errorStorage"));
      console.error(err);
    }
    if (this._started) this._setState("monitoring");
  }

  async _populateCameras() {
    const select = /** @type {HTMLSelectElement | null} */ (this.shadowRoot.querySelector(".camera-select"));
    if (!select) return;
    const cams = await RecorderService.listCameras();
    if (cams.length <= 1) {
      select.hidden = true;
      return;
    }
    select.hidden = false;
    select.innerHTML = "";
    cams.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.deviceId;
      const label = c.label || `${t("unknownCamera")} ${i + 1}`;
      opt.textContent = label;
      select.appendChild(opt);
    });
  }

  async _requestWakeLock() {
    if (!hasWakeLock()) {
      this._updateWakeLabel();
      return;
    }
    try {
      this._wakeLock = await navigator.wakeLock.request("screen");
      this._wakeLock.addEventListener("release", () => {
        this._wakeLock = null;
        this._updateWakeLabel();
      });
    } catch {
      this._wakeLock = null;
    }
    this._updateWakeLabel();
  }

  _releaseWakeLock() {
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    this._updateWakeLabel();
  }

  _updateWakeLabel() {
    const el = this.shadowRoot.querySelector(".wake");
    if (!el) return;
    if (!hasWakeLock()) {
      el.textContent = t("wakeLockUnsupported");
      return;
    }
    el.textContent = this._wakeLock ? t("wakeLockOn") : t("wakeLockOff");
  }

  /** Draw the detection areas over the visible (letterboxed) video content. */
  _layoutRegion() {
    const box = /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".areas-box"));
    const wrap = this.shadowRoot.querySelector(".preview-wrap");
    const video = this.shadowRoot.querySelector("video");
    if (!box || !wrap || !video) return;
    const areas = getSettings().detectionAreas;
    if (!areas.length || !video.videoWidth || !wrap.clientWidth || !wrap.clientHeight) {
      box.style.display = "none";
      return;
    }
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const scale = Math.min(W / video.videoWidth, H / video.videoHeight);
    const cw = video.videoWidth * scale, ch = video.videoHeight * scale;
    box.style.display = "block";
    box.style.left = `${(W - cw) / 2}px`;
    box.style.top = `${(H - ch) / 2}px`;
    box.style.width = `${cw}px`;
    box.style.height = `${ch}px`;
    box.replaceChildren(overlaySvg(areas, "cam-areas-hole"));
    areas.forEach((a, i) => {
      const b = bbox(a);
      const lab = document.createElement("span");
      lab.className = "label";
      lab.textContent = a.sensitivity != null ? `${a.name} · ${a.sensitivity}` : a.name;
      lab.dataset.id = a.id;
      lab.style.left = `${b.x * 100}%`;
      lab.style.top = `${b.y * 100}%`;
      lab.style.background = a.enabled ? colorFor(i) : "#9ca3af";
      box.appendChild(lab);
    });
  }

  /** Live camera stream while monitoring (shared with the detection-area editor), else null. */
  liveStream() {
    return this._started ? this.recorder.stream : null;
  }

  /** (Re)connect the sound detector to the microphone track, or turn it off. */
  _attachSound(s = this._settings) {
    const wantMic = s.soundTrigger || s.recordAudio;
    const on = wantMic && this.recorder.hasAudio && this._started !== false && this.sound.attach(this.recorder.stream);
    if (!on) this.sound.detach();
    // the microphone track itself can be muted by the system/browser: say so
    const track = this.recorder.stream?.getAudioTracks()[0];
    if (on && track) {
      const sync = () => this._micMuted(track.muted);
      track.onmute = sync;
      track.onunmute = sync;
      sync();
    }
    this.shadowRoot.querySelector(".smeter")?.classList.toggle("no-trigger", !s.soundTrigger);
    /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".sound-row")).hidden = !this.sound.active;
    /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".sound-sens")).hidden = !s.soundTrigger;
    this._placeSoundTick();
  }

  _updateSoundMeter() {
    const fill = /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".smeter-fill"));
    const meter = this.shadowRoot.querySelector(".smeter");
    const lv = this.sound.level;
    if (fill) {
      fill.style.width = `${lv}%`;
      fill.style.background = lv >= this.sound.thresholdLevel() ? "var(--mw-meter-high)" : "var(--mw-meter-low)";
    }
    meter?.setAttribute("aria-valuenow", String(Math.round(lv)));
    const db = this.shadowRoot.querySelector(".sound-db");
    if (db) db.textContent = `${Math.max(-99, Math.round(this.sound.db))} dB`;
  }

  /** Visible hints for the two ways a microphone silently produces nothing. */
  _micMuted(muted) {
    this._micIsMuted = muted;
    this._syncAudioNotice();
  }

  _syncAudioNotice() {
    const el = /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".notice"));
    const mine = [t("micMuted"), t("soundBlocked")];
    const msg = this._micIsMuted ? t("micMuted") : this.sound.blocked ? t("soundBlocked") : "";
    if (msg) this._notice(msg);
    else if (mine.includes(el.textContent)) this._notice("");
  }

  /** Called when settings change while active */
  applySettings() {
    const s = getSettings();
    this._settings = s;
    if (this._started) {
      const needMic = s.recordAudio || s.soundTrigger;
      if (needMic !== !!this.recorder.hasAudio && !(needMic && this.recorder.audioFailed)) {
        // the microphone is part of the camera stream: save the running clip, then restart the camera
        this._restartPending = true;
        if (this.state === "recording") this.recorder.stopRecording(false);
      } else {
        this.recorder.includeAudio = s.recordAudio && !!this.recorder.hasAudio;
        this._attachSound(s);
      }
    } else {
      /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".sound-sens")).hidden = !s.soundTrigger;
    }
    // times may have moved without arming changing: the status line must follow anyway
    if (!this._refreshSchedule(true)) this._updateStatus();
    this.motion.setAreas(s.detectionAreas);
    this._layoutRegion();
    this.motion.setSensitivity(s.sensitivity);
    if (s.keepAwake && this._started && !this._wakeLock) this._requestWakeLock();
    if (!s.keepAwake) this._releaseWakeLock();
  }
}

customElements.define("camera-monitor", CameraMonitor);
