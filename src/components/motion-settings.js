import { t, onLocaleChange, setLocale, getLocale, formatBytes } from "../services/i18n.js";
import { getSettings, updateSettings, resetSettings, defaultSettings, onSettingsChange } from "../services/settings.js";
import { toQuery } from "../services/urlsettings.js";
import { getStorageUsage, estimateQuota, requestPersistentStorage } from "../services/storage.js";
import { supportedLocales } from "../i18n/locales.js";
import { VERSION } from "../version.js";
import { evaluate as evaluateSchedules, MAX_SCHEDULES, oneOffIn, toDate, dateStr, timeStr } from "../services/schedule.js";
import { sharedCss, syncRange } from "../styles/shared.js";
import { icon } from "./icons.js";
import { recordingFormat } from "../services/capabilities.js";
import { SoundDetector, unlockAudio } from "../services/sound.js";
import "./area-editor.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host { display: block; height: 100%; overflow-y: auto; background: var(--mw-bg); container-type: inline-size; }
    .wrap { max-width: 40rem; margin: 0 auto; padding: var(--mw-space-2) var(--mw-space-4) calc(var(--mw-space-8) + var(--mw-safe-bottom)); }
    h2.title { margin: 0 0 var(--mw-space-4); font-size: var(--mw-text-xl); letter-spacing: -0.02em; }
    section { margin-bottom: var(--mw-space-6); }
    h3.sec { margin: 0 0 var(--mw-space-2) var(--mw-space-2); font-size: var(--mw-text-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--mw-text-muted); display: flex; align-items: center; gap: var(--mw-space-2); }
    .group { overflow: hidden; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: var(--mw-space-4); padding: var(--mw-space-4); border-bottom: 1px solid var(--mw-border); }
    .row:last-child { border-bottom: 0; }
    .row.stack { flex-direction: column; align-items: stretch; gap: var(--mw-space-3); }
    .row-text { flex: 1; min-width: 0; }
    .row-label { display: block; font-weight: 600; font-size: var(--mw-text-base); letter-spacing: -0.005em; margin: 0; }
    .help { font-size: var(--mw-text-sm); color: var(--mw-text-muted); margin: 2px 0 0; line-height: 1.4; }
    .head-line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mw-space-3); }
    .value { font-variant-numeric: tabular-nums; color: var(--mw-text-muted); font-weight: 600; font-size: var(--mw-text-sm); }
    .num { display: flex; align-items: center; gap: var(--mw-space-2); flex: none; }
    .num input { width: 5.5rem; text-align: right; }
    .num .unit { color: var(--mw-text-muted); font-size: var(--mw-text-sm); min-width: 2rem; }
    .row select { width: auto; min-width: 9rem; }
    .btn-row { display: flex; gap: var(--mw-space-2); flex-wrap: wrap; }
    .btn-row .btn { flex: 1 1 9rem; }
    .mic-meter { height: 10px; border-radius: var(--mw-radius-full); background: var(--mw-surface-3); overflow: hidden; }
    .mic-fill { display: block; height: 100%; width: 0%; background: var(--mw-meter-low); transition: width 80ms linear; }
    .region-val { font-size: var(--mw-text-sm); font-weight: 600; margin: 0; }

    .sched-body { padding: var(--mw-space-4); display: flex; flex-direction: column; gap: var(--mw-space-3); }
    .sched-status { font-size: var(--mw-text-sm); color: var(--mw-text-muted); margin: 0; }
    .sched-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mw-space-3); }
    .sched { border: 1px solid var(--mw-border); border-radius: var(--mw-radius); padding: var(--mw-space-3); background: var(--mw-surface-2); display: flex; flex-direction: column; gap: var(--mw-space-3); }
    .sched .line { display: flex; flex-wrap: wrap; gap: var(--mw-space-2) var(--mw-space-3); align-items: center; }
    .sched .name { flex: 1 1 10rem; width: auto; }
    .sched .act { display: inline-flex; gap: var(--mw-space-2); align-items: center; font-size: var(--mw-text-sm); font-weight: 600; margin: 0; }
    .sched .days { display: flex; flex-wrap: wrap; gap: var(--mw-space-1); }
    .sched .times { display: flex; flex-wrap: wrap; gap: var(--mw-space-3); }
    .sched .times label { display: flex; align-items: center; gap: var(--mw-space-2); font-size: var(--mw-text-sm); font-weight: 600; }
    .sched .times input { width: auto; }
    .sched .del { margin-left: auto; }
    .sched .kind .seg span { padding-inline: var(--mw-space-3); }
    .sched .times input[type="date"] { width: auto; }
    .sched .next-day { font-size: var(--mw-text-xs); color: var(--mw-text-muted); font-weight: 500; }
    .sched .quick { display: flex; flex-wrap: wrap; gap: var(--mw-space-1); align-items: center; }
    .sched .quick-label { font-size: var(--mw-text-sm); font-weight: 600; margin-right: var(--mw-space-1); }
    .sched .err { margin: 0; font-size: var(--mw-text-sm); color: var(--mw-danger-text); }
    .sched .err:empty { display: none; }
    .sched input[aria-invalid="true"] { border-color: var(--mw-danger-text); }
    .sched.over { opacity: 0.65; }
    .sched-actions { display: flex; flex-wrap: wrap; gap: var(--mw-space-2); }

    .foot { text-align: center; }
    .version { font-size: var(--mw-text-xs); color: var(--mw-text-muted); margin-top: var(--mw-space-4); }
    .version code { font-family: var(--mw-font-mono); user-select: all; }
    .warning { font-size: var(--mw-text-xs); color: var(--mw-text-muted); margin: 0; padding: 0 var(--mw-space-4) var(--mw-space-4); }

    /* ---- dialog (bottom sheet on phones) ---- */
    .dialog-backdrop {
      position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
      padding: var(--mw-space-3); background: rgba(5,6,10,0.7); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    }
    .area-dialog { background: var(--mw-surface); border: 1px solid var(--mw-border); border-radius: var(--mw-radius-lg); padding: var(--mw-space-4); width: 100%; max-width: 48rem; max-height: 100%; overflow-y: auto; box-shadow: var(--mw-shadow); }
    .area-dialog h2 { margin: 0 0 var(--mw-space-2); font-size: var(--mw-text-lg); letter-spacing: -0.01em; }
    .area-dialog p { margin: 0 0 var(--mw-space-3); font-size: var(--mw-text-sm); color: var(--mw-text-muted); }
    .area-dialog .btn-row { margin-top: var(--mw-space-3); }
    @container (max-width: 520px) {
      .row { padding: var(--mw-space-3) var(--mw-space-4); }
      .row.wrap-sm { flex-direction: column; align-items: stretch; }
      .dialog-backdrop { align-items: flex-end; padding: 0; }
      .area-dialog { border-radius: var(--mw-radius-lg) var(--mw-radius-lg) 0 0; max-height: 94%; padding-bottom: calc(var(--mw-space-4) + var(--mw-safe-bottom)); }
    }
  </style>
  <div class="wrap">
    <h2 class="title"></h2>

    <section aria-labelledby="h-detect">
      <h3 class="sec" id="h-detect"><span class="h-detect"></span></h3>
      <div class="card group">
        <div class="row stack">
          <div class="head-line"><label class="row-label sens-label" for="sens"></label><span class="value sens-val" aria-hidden="true"></span></div>
          <input type="range" id="sens" min="0" max="100" step="1" class="sens-range" aria-describedby="sens-help">
          <p class="help sens-help" id="sens-help"></p>
        </div>
        <div class="row">
          <div class="row-text"><label class="row-label quiet-label" for="quiet"></label><p class="help quiet-help" id="quiet-help"></p></div>
          <div class="num"><input type="number" id="quiet" min="1" max="60" step="1" class="quiet-input" aria-describedby="quiet-help"><span class="unit unit-s"></span></div>
        </div>
        <div class="row">
          <div class="row-text"><label class="row-label max-label" for="max"></label><p class="help max-help" id="max-help"></p></div>
          <div class="num"><input type="number" id="max" min="0" max="60" step="1" class="max-input" aria-describedby="max-help"><span class="unit unit-min"></span></div>
        </div>
        <div class="row stack">
          <div class="row-text"><span class="row-label area-label" id="area-label"></span><p class="help area-help"></p></div>
          <p class="region-val" role="status" aria-labelledby="area-label"></p>
          <div class="btn-row">
            <button type="button" class="btn region-edit-btn">${icon("scan")}<span></span></button>
            <button type="button" class="btn btn-ghost region-clear-btn"></button>
          </div>
        </div>
      </div>
    </section>

    <section aria-labelledby="h-sound">
      <h3 class="sec" id="h-sound"><span class="h-sound"></span></h3>
      <div class="card group">
        <div class="row">
          <div class="row-text"><label class="row-label sound-label" for="sound-check"></label><p class="help sound-help" id="sound-help"></p></div>
          <input type="checkbox" class="switch sound-check" id="sound-check" aria-describedby="sound-help">
        </div>
        <div class="row stack">
          <div class="head-line"><label class="row-label ssens-label" for="ssens"></label><span class="value ssens-val" aria-hidden="true"></span></div>
          <input type="range" id="ssens" min="0" max="100" step="1" class="ssens-range">
        </div>
        <div class="row stack">
          <div class="head-line"><span class="row-label mic-label" id="mic-label"></span><span class="value mic-db" aria-hidden="true"></span></div>
          <div class="mic-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="mic-label"><span class="mic-fill"></span></div>
          <p class="help mic-help" role="status"></p>
          <button type="button" class="btn btn-outline mic-test-btn">${icon("mic")}<span></span></button>
        </div>
        <div class="row">
          <div class="row-text"><label class="row-label audio-label" for="audio-check"></label><p class="help audio-help" id="audio-help"></p></div>
          <input type="checkbox" class="switch audio-check" id="audio-check" aria-describedby="audio-help">
        </div>
      </div>
    </section>

    <section aria-labelledby="h-sched">
      <h3 class="sec" id="h-sched"><span class="h-sched"></span></h3>
      <div class="card group sched-body">
        <p class="help sched-help"></p>
        <p class="sched-status" role="status"></p>
        <ul class="sched-list" aria-labelledby="h-sched"></ul>
        <div class="sched-actions">
          <button type="button" class="btn btn-outline sched-add">${icon("plus")}<span></span></button>
          <button type="button" class="btn btn-outline sched-soon">${icon("timer")}<span></span></button>
        </div>
      </div>
    </section>

    <section aria-labelledby="h-camera">
      <h3 class="sec" id="h-camera"><span class="h-camera"></span></h3>
      <div class="card group">
        <div class="row wrap-sm">
          <div class="row-text"><span class="row-label qual-label" id="qual-label"></span></div>
          <div class="seg" role="radiogroup" aria-labelledby="qual-label">
            <label><input type="radio" name="quality" value="low"><span class="q-low"></span></label>
            <label><input type="radio" name="quality" value="medium"><span class="q-medium"></span></label>
            <label><input type="radio" name="quality" value="high"><span class="q-high"></span></label>
          </div>
        </div>
        <div class="row">
          <div class="row-text"><span class="row-label format-label" id="format-label"></span><p class="help format-help"></p></div>
          <span class="value format-val" aria-labelledby="format-label"></span>
        </div>
        <div class="row wrap-sm">
          <div class="row-text"><label class="row-label preview-label" for="preview-select"></label><p class="help preview-help"></p></div>
          <select id="preview-select" class="preview-select">
            <option value="auto"></option><option value="video"></option><option value="canvas"></option>
          </select>
        </div>
        <div class="row">
          <div class="row-text"><label class="row-label awake-label" for="awake-check"></label><p class="help awake-help" id="awake-help"></p></div>
          <input type="checkbox" class="switch awake-check" id="awake-check" aria-describedby="awake-help">
        </div>
      </div>
    </section>

    <section aria-labelledby="h-look">
      <h3 class="sec" id="h-look"><span class="h-look"></span></h3>
      <div class="card group">
        <div class="row wrap-sm">
          <div class="row-text"><span class="row-label theme-label" id="theme-label"></span></div>
          <div class="seg" role="radiogroup" aria-labelledby="theme-label">
            <label><input type="radio" name="theme" value="auto"><span class="th-auto"></span></label>
            <label><input type="radio" name="theme" value="light"><span class="th-light"></span></label>
            <label><input type="radio" name="theme" value="dark"><span class="th-dark"></span></label>
          </div>
        </div>
        <div class="row">
          <label class="row-label lang-label" for="lang"></label>
          <select id="lang" class="lang-select"></select>
        </div>
      </div>
    </section>

    <section aria-labelledby="h-data">
      <h3 class="sec" id="h-data"><span class="h-data"></span></h3>
      <div class="card group">
        <div class="row stack">
          <div class="head-line"><span class="row-label storage-label" id="storage-label"></span><span class="value storage-val" role="status" aria-labelledby="storage-label"></span></div>
          <button type="button" class="btn btn-outline persist-btn"></button>
          <p class="help bg-warn" style="margin:0"></p>
        </div>
        <div class="row stack">
          <div class="row-text"><span class="row-label link-label"></span><p class="help link-help"></p></div>
          <button type="button" class="btn btn-outline copy-link-btn">${icon("link")}<span></span></button>
        </div>
      </div>
    </section>

    <div class="foot">
      <button type="button" class="btn btn-danger reset-btn"></button>
      <div class="version"><span class="version-label"></span>: <code class="version-val"></code></div>
    </div>
  </div>
`;

export class MotionSettings extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._unsub = null;
    this._unsubSettings = null;
  }

  connectedCallback() {
    this._populate();
    this._bind();
    this._render();
    this._refreshStorage();
    this._unsub = onLocaleChange(() => this._render());
    // reflect changes made elsewhere (the sliders on the camera tab, the URL)
    this._unsubSettings = onSettingsChange(() => this._syncControls());
  }

  disconnectedCallback() {
    this._unsub?.();
    this._unsubSettings?.();
    this._stopMicTest();
  }

  _q(sel) { return /** @type {HTMLInputElement} */ (this.shadowRoot.querySelector(sel)); }

  /** Push stored values into the controls. */
  _populate() {
    const s = getSettings();
    this._q(".quiet-input").value = String(s.quietPeriodSec);
    this._q(".max-input").value = String(s.maxClipMinutes);
    this._q(".awake-check").checked = s.keepAwake;
    this._q(".audio-check").checked = s.recordAudio;
    this._q(".sound-check").checked = s.soundTrigger;
    /** @type {HTMLSelectElement} */ (this._q(".preview-select")).value = s.preview;
    this.shadowRoot.querySelectorAll('input[name="quality"]').forEach((r) => { /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === s.videoQuality; });
    this.shadowRoot.querySelectorAll('input[name="theme"]').forEach((r) => { /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === s.theme; });

    const lang = /** @type {HTMLSelectElement} */ (this._q(".lang-select"));
    lang.innerHTML = "";
    const labels = { en: "English", da: "Dansk", es: "Español", "zh-Hans": "简体中文" };
    for (const code of supportedLocales) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labels[code] || code;
      if (code === getLocale()) opt.selected = true;
      lang.appendChild(opt);
    }
    this._syncControls();
  }

  _syncControls() {
    const s = getSettings();
    const set = (sel, v, valSel) => {
      const r = this._q(sel);
      if (r.value !== String(v)) r.value = String(v);
      syncRange(r);
      const val = this.shadowRoot.querySelector(valSel);
      if (val) val.textContent = String(v);
    };
    set(".sens-range", s.sensitivity, ".sens-val");
    set(".ssens-range", s.soundSensitivity, ".ssens-val");
    this._q(".ssens-range").disabled = !s.soundTrigger;
    this._q(".audio-check").checked = s.recordAudio;
    this._q(".sound-check").checked = s.soundTrigger;
    this._renderRegion();
  }

  /** Live microphone level, so you can see whether sound is picked up at all. */
  async _toggleMicTest() {
    if (this._mt) { this._stopMicTest(); return; }
    unlockAudio();                                   // inside the tap that started the test
    const help = this._q(".mic-help");
    let stream;
    try {
      // raw signal: no noise suppression / gain control that could swallow quiet sounds
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch {
      help.textContent = t("micTestDenied");
      return;
    }
    const det = new SoundDetector();
    if (!det.attach(stream)) {
      stream.getTracks().forEach((tr) => tr.stop());
      help.textContent = t("micTestDenied");
      return;
    }
    const started = performance.now();
    let loudest = -100;
    const mt = { stream, det, raf: 0 };
    this._mt = mt;
    this._q(".mic-test-btn span").textContent = t("micTestStop");
    const fill = this._q(".mic-fill"), meter = this._q(".mic-meter");
    const tick = () => {
      const now = performance.now();
      // stop when the tab/panel is no longer visible
      if (!this.isConnected || this.offsetParent === null || document.hidden) { this._stopMicTest(); return; }
      det.poll(now);
      loudest = Math.max(loudest, det.db);
      fill.style.width = `${det.level}%`;
      meter.setAttribute("aria-valuenow", String(Math.round(det.level)));
      this._q(".mic-db").textContent = `${Math.max(-99, Math.round(det.db))} dB`;
      const d = det.describe();
      const silent = now - started > 2000 && loudest < -80;
      help.textContent = det.blocked ? t("soundBlocked")
        : d.ended ? t("micTestEnded")
        : d.muted ? t("micTestMuted")
        : silent ? `${t("micTestSilent")}${d.label ? ` (${d.label})` : ""}`
        : `${t("micTestHelp")}${d.label ? ` (${d.label})` : ""}`;
      mt.raf = requestAnimationFrame(tick);
    };
    mt.raf = requestAnimationFrame(tick);
  }

  _stopMicTest() {
    const mt = this._mt;
    if (!mt) return;
    cancelAnimationFrame(mt.raf);
    mt.det.detach();
    mt.stream.getTracks().forEach((tr) => tr.stop());
    this._mt = null;
    this._q(".mic-fill").style.width = "0%";
    this._q(".mic-db").textContent = "";
    this._q(".mic-test-btn span").textContent = t("micTest");
    this._q(".mic-help").textContent = t("micTestHelp");
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("settings-changed", { bubbles: true, composed: true }));
  }

  _toast(message, kind = "info") {
    this.dispatchEvent(new CustomEvent("toast", { bubbles: true, composed: true, detail: { message, kind } }));
  }

  _bind() {
    const on = (sel, ev, fn) => this._q(sel).addEventListener(ev, fn);
    on(".sens-range", "input", (e) => { updateSettings({ sensitivity: Number(e.target.value) }); this._emit(); });
    on(".ssens-range", "input", (e) => { updateSettings({ soundSensitivity: Number(e.target.value) }); this._emit(); });
    on(".quiet-input", "change", (e) => {
      const v = Math.max(1, Math.min(60, Number(e.target.value) || 5));
      e.target.value = String(v);
      updateSettings({ quietPeriodSec: v });
      this._emit();
    });
    on(".max-input", "change", (e) => {
      const v = Math.max(0, Math.min(60, Number(e.target.value) || 0));
      e.target.value = String(v);
      updateSettings({ maxClipMinutes: v });
      this._emit();
    });
    on(".lang-select", "change", (e) => {
      setLocale(e.target.value);
      updateSettings({ language: e.target.value });
    });
    on(".preview-select", "change", (e) => { updateSettings({ preview: e.target.value }); this._emit(); });
    on(".awake-check", "change", (e) => { updateSettings({ keepAwake: e.target.checked }); this._emit(); });
    on(".mic-test-btn", "click", () => this._toggleMicTest());
    on(".audio-check", "change", (e) => { updateSettings({ recordAudio: e.target.checked }); this._emit(); });
    on(".sound-check", "change", (e) => { updateSettings({ soundTrigger: e.target.checked }); this._syncControls(); this._emit(); });
    this.shadowRoot.querySelectorAll('input[name="quality"]').forEach((r) => r.addEventListener("change", (e) => {
      updateSettings({ videoQuality: /** @type {any} */ (e.target).value });
      this._emit();
    }));
    this.shadowRoot.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener("change", (e) => {
      updateSettings({ theme: /** @type {any} */ (e.target).value });
    }));

    on(".region-edit-btn", "click", (e) => this._openAreaDialog(/** @type {HTMLElement} */ (e.currentTarget)));
    on(".region-clear-btn", "click", () => this._saveAreas([]));

    const addSchedule = (extra) => {
      const list = getSettings().schedules;
      if (list.length >= MAX_SCHEDULES) return;
      let n = 1;
      while (list.some((s) => s.name === `${t("scheduleDefaultName")} ${n}`)) n++;
      const sched = { id: "", name: `${t("scheduleDefaultName")} ${n}`, days: [0, 1, 2, 3, 4, 5, 6], start: "22:00", end: "06:00", enabled: true, ...extra };
      this._saveSchedules([...list, sched]);
      this._renderSchedules(true);
      const rows = this.shadowRoot.querySelectorAll(".sched .name");
      /** @type {HTMLElement | undefined} */ (/** @type {unknown} */ (rows[rows.length - 1]))?.focus();
    };
    on(".sched-add", "click", () => addSchedule({}));
    // one-off window starting in 5 minutes, for an hour (adjustable afterwards)
    on(".sched-soon", "click", () => addSchedule(oneOffIn(5, 1)));

    on(".persist-btn", "click", async () => {
      const ok = await requestPersistentStorage();
      this._q(".persist-btn").textContent = ok ? t("persistentGranted") : t("persistentDenied");
    });

    on(".copy-link-btn", "click", async () => {
      const qs = toQuery(getSettings(), defaultSettings);
      const url = `${location.origin}${location.pathname}${qs ? `?${qs}` : ""}`;
      try {
        await navigator.clipboard.writeText(url);
        this._toast(t("linkCopied"));
      } catch {
        window.prompt(t("copyLink"), url);
      }
    });

    on(".reset-btn", "click", () => {
      resetSettings();
      setLocale(defaultSettings.language);
      this._populate();
      this._render();
      this._emit();
    });
  }

  _render() {
    const txt = (sel, key) => { const el = this.shadowRoot.querySelector(sel); if (el) el.textContent = t(key); };
    txt(".title", "settingsTitle");
    txt(".h-detect", "secDetection"); txt(".h-sound", "secSound"); txt(".h-sched", "scheduleTitle");
    txt(".h-camera", "secCamera"); txt(".h-look", "secAppearance"); txt(".h-data", "secData");
    txt(".sens-label", "sensitivity"); txt(".sens-help", "sensitivityHelp");
    txt(".quiet-label", "quietPeriod"); txt(".quiet-help", "quietPeriodHelp"); txt(".unit-s", "unitSeconds");
    txt(".max-label", "maxClipLength"); txt(".max-help", "maxClipLengthHelp"); txt(".unit-min", "unitMinutes");
    txt(".area-label", "detectionArea"); txt(".area-help", "detectionAreaHelp");
    txt(".region-edit-btn span", "setDetectionArea"); txt(".region-clear-btn", "useWholeScreen");
    txt(".sound-label", "soundTrigger"); txt(".sound-help", "soundTriggerHelp");
    txt(".ssens-label", "soundSensitivity");
    txt(".audio-label", "recordAudio"); txt(".mic-label", "micTest"); txt(".mic-test-btn span", this._mt ? "micTestStop" : "micTest");
    if (!this._mt) this._q(".mic-help").textContent = t("micTestHelp"); txt(".audio-help", "recordAudioHelp");
    txt(".sched-help", "scheduleHelp"); txt(".sched-add span", "scheduleAdd"); txt(".sched-soon span", "scheduleIn5");
    txt(".qual-label", "videoQuality"); txt(".q-low", "qualityLow"); txt(".q-medium", "qualityMedium"); txt(".q-high", "qualityHigh");
    txt(".format-label", "videoFormat");
    { const f = recordingFormat(getSettings().recordAudio); this._q(".format-val").textContent = f.mp4 ? "MP4" : "WebM";
      this._q(".format-help").textContent = f.mp4 ? t("formatMp4Help") : t("formatWebmHelp"); }
    txt(".preview-label", "previewMode"); txt(".preview-help", "previewHelp");
    { const o = this._q(".preview-select").options; o[0].textContent = t("previewAuto"); o[1].textContent = t("previewVideo"); o[2].textContent = t("previewCanvas"); }
    txt(".awake-label", "keepAwake"); txt(".awake-help", "keepAwakeHelp");
    txt(".theme-label", "theme"); txt(".th-auto", "themeAuto"); txt(".th-light", "themeLight"); txt(".th-dark", "themeDark");
    txt(".lang-label", "language");
    txt(".storage-label", "storageUsage"); txt(".persist-btn", "requestPersistent"); txt(".bg-warn", "backgroundWarning");
    txt(".link-label", "settingsLink"); txt(".link-help", "settingsLinkHelp"); txt(".copy-link-btn span", "copyLink");
    txt(".reset-btn", "resetDefaults"); txt(".version-label", "version");
    this._q(".version-val").textContent = VERSION;
    this._renderSchedules(true);
    this._syncControls();
  }

  _saveSchedules(list) {
    updateSettings({ schedules: list });
    this._renderScheduleStatus();
    this.dispatchEvent(new CustomEvent("settings-changed", { bubbles: true, composed: true }));
  }

  _dayNames(style) {
    const tag = getLocale() === "zh-Hans" ? "zh-CN" : getLocale();
    const fmt = new Intl.DateTimeFormat(tag, { weekday: style });
    // 2024-01-07 is a Sunday; index = Date#getDay()
    return Array.from({ length: 7 }, (_, d) => fmt.format(new Date(2024, 0, 7 + d)));
  }

  _renderScheduleStatus() {
    const el = this.shadowRoot.querySelector(".sched-status");
    if (!el) return;
    const list = getSettings().schedules;
    const r = evaluateSchedules(list);
    const time = (d) => d ? new Intl.DateTimeFormat(getLocale() === "zh-Hans" ? "zh-CN" : getLocale(),
      { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
        ...(d.getTime() - Date.now() > 6 * 86400000 ? { day: "numeric", month: "short" } : {}) }).format(d) : "";
    el.textContent = !r.restricted ? t("scheduleNone")
      : r.active ? t("scheduleNowActive", { name: r.names.join(", "), from: time(r.from), until: time(r.until) })
      : r.next ? t("scheduleNowInactive", { next: `${r.nextName} · ${time(r.next)} – ${time(r.nextUntil)}` })
      : t("scheduleNoUpcoming");
    // one-off windows that are over are shown faded
    const now = new Date();
    this.shadowRoot.querySelectorAll(".sched").forEach((li) => {
      const s = list.find((x) => x.id === li.getAttribute("data-id"));
      li.classList.toggle("over", !!s?.date && toDate(s.endDate || s.date, s.end) <= now);
    });
  }

  /** Rebuild the schedule rows (`rebuild`) or just refresh texts. */
  _renderSchedules(rebuild = false) {
    const ul = this.shadowRoot.querySelector(".sched-list");
    if (!ul) return;
    const list = getSettings().schedules;
    const add = /** @type {HTMLButtonElement} */ (this.shadowRoot.querySelector(".sched-add"));
    add.disabled = list.length >= MAX_SCHEDULES;
    this._renderScheduleStatus();
    if (!rebuild && ul.children.length === list.length) return;
    ul.innerHTML = "";
    const long = this._dayNames("long"), short = this._dayNames("short");
    list.forEach((s, idx) => {
      const li = document.createElement("li");
      li.className = "sched";
      const dayBtns = [1, 2, 3, 4, 5, 6, 0].map((d) =>
        `<button type="button" class="chip day" data-day="${d}" aria-pressed="${s.days.includes(d)}" aria-label="${long[d]}">${short[d]}</button>`).join("");
      li.setAttribute("data-id", s.id);
      const once = !!s.date;
      li.innerHTML = `
        <div class="line">
          <input type="text" class="name" maxlength="40" aria-label="${t("scheduleName")}">
          <label class="act"><input type="checkbox" class="switch en" aria-label="${t("scheduleActive")}"> <span>${t("scheduleActive")}</span></label>
          <button type="button" class="btn btn-danger btn-sm del" aria-label="${t("scheduleDelete")}: ${s.name.replace(/"/g, "&quot;")}">${t("scheduleDelete")}</button>
        </div>
        <div class="kind">
          <div class="seg" role="radiogroup" aria-label="${t("scheduleRepeat")}">
            <label><input type="radio" name="kind-${idx}" value="weekly"${once ? "" : " checked"}><span>${t("scheduleWeekly")}</span></label>
            <label><input type="radio" name="kind-${idx}" value="once"${once ? " checked" : ""}><span>${t("scheduleOnce")}</span></label>
          </div>
        </div>
        ${once ? `
        <div class="times">
          <label>${t("scheduleStart")} <input type="date" class="start-date" required aria-label="${t("scheduleStartDate")}"> <input type="time" class="start" required aria-label="${t("scheduleStart")}"></label>
          <label>${t("scheduleEnd")} <input type="date" class="end-date" required aria-label="${t("scheduleEndDate")}"> <input type="time" class="end" required aria-label="${t("scheduleEnd")}"></label>
        </div>
        <p class="err" role="alert"></p>
        <div class="quick">
          <button type="button" class="chip soon">${t("scheduleIn5")}</button>
          <span class="quick-label">${t("scheduleDuration")}</span>
          ${[1, 4, 8, 12].map((h) => `<button type="button" class="chip dur" data-h="${h}">${t("scheduleHours", { h })}</button>`).join("")}
        </div>` : `
        <div class="days" role="group" aria-label="${t("scheduleDays")}">${dayBtns}</div>
        <div class="times">
          <label>${t("scheduleStart")} <input type="time" class="start" required></label>
          <label>${t("scheduleEnd")} <input type="time" class="end" required> <span class="next-day"></span></label>
        </div>`}`;
      const $ = (sel) => /** @type {HTMLInputElement} */ (li.querySelector(sel));
      $(".name").value = s.name;
      $(".en").checked = s.enabled;
      $(".start").value = s.start;
      $(".end").value = s.end;
      const update = (patch) => {
        const cur = getSettings().schedules;
        const i = cur.findIndex((x) => x.id === s.id);
        if (i < 0) return;
        cur[i] = { ...cur[i], ...patch };
        this._saveSchedules(cur);
      };
      $(".name").addEventListener("change", () => update({ name: $(".name").value }));
      $(".en").addEventListener("change", () => update({ enabled: $(".en").checked }));
      li.querySelectorAll(`input[name="kind-${idx}"]`).forEach((r) => r.addEventListener("change", () => {
        const cur = getSettings().schedules.find((x) => x.id === s.id);
        if (!cur) return;
        if (/** @type {HTMLInputElement} */ (r).value === "once") {
          // start at the next time the weekly window would have started (today or tomorrow)
          const now = new Date();
          let from = toDate(dateStr(now), cur.start);
          if (from <= now) from.setDate(from.getDate() + 1);
          update({ date: dateStr(from), endDate: "" });   // normalizing puts the end after the start
        } else {
          update({ date: undefined, endDate: undefined });
        }
        this._renderSchedules(true);
        /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(`.sched[data-id="${s.id}"] input[name="kind-${idx}"]:checked`))?.focus();
      }));
      if (once) {
        $(".start-date").value = s.date;
        $(".end-date").value = s.endDate || s.date;
        const read = () => ({
          from: $(".start-date").value && $(".start").value ? toDate($(".start-date").value, $(".start").value) : null,
          until: $(".end-date").value && $(".end").value ? toDate($(".end-date").value, $(".end").value) : null,
        });
        const show = (from, until) => {
          $(".start-date").value = dateStr(from); $(".start").value = timeStr(from);
          $(".end-date").value = dateStr(until); $(".end").value = timeStr(until);
        };
        const save = (from, until) => {
          show(from, until);
          $(".end-date").min = $(".start-date").value;
          update({ date: dateStr(from), start: timeStr(from), endDate: dateStr(until), end: timeStr(until) });
        };
        $(".end-date").min = s.date;
        const setError = (msg) => {
          li.querySelector(".err").textContent = msg;
          for (const c of [".end-date", ".end"]) $(c).setAttribute("aria-invalid", String(!!msg));
        };
        // moving the start keeps the duration, so the end can never fall before it
        const onStart = () => {
          const cur = getSettings().schedules.find((x) => x.id === s.id);
          const { from } = read();
          if (!cur || !from) return;
          const dur = toDate(cur.endDate || cur.date, cur.end).getTime() - toDate(cur.date, cur.start).getTime();
          setError("");
          save(from, new Date(from.getTime() + Math.max(dur, 60000)));
        };
        const onEnd = () => {
          const { from, until } = read();
          if (!from || !until) return;
          if (until <= from) return setError(t("scheduleEndBeforeStart"));
          setError("");
          save(from, until);
        };
        $(".start-date").addEventListener("change", onStart);
        $(".start").addEventListener("change", onStart);
        $(".end-date").addEventListener("change", onEnd);
        $(".end").addEventListener("change", onEnd);
        li.querySelector(".soon")?.addEventListener("click", () => {
          const cur = getSettings().schedules.find((x) => x.id === s.id);
          if (!cur) return;
          const dur = toDate(cur.endDate || cur.date, cur.end).getTime() - toDate(cur.date, cur.start).getTime();
          const o = oneOffIn(5, Math.max(dur, 60000) / 3600000);
          setError("");
          save(toDate(o.date, o.start), toDate(o.endDate, o.end));
        });
        li.querySelectorAll(".dur").forEach((b) => b.addEventListener("click", () => {
          const { from } = read();
          if (!from) return;
          setError("");
          save(from, new Date(from.getTime() + Number(b.getAttribute("data-h")) * 3600000));
        }));
      } else {
        // a weekly window that ends at or before its start carries on into the next day: say so
        const nextDay = () => { li.querySelector(".next-day").textContent = $(".end").value <= $(".start").value ? t("scheduleNextDay") : ""; };
        nextDay();
        $(".start").addEventListener("change", () => { if ($(".start").value) update({ start: $(".start").value }); nextDay(); });
        $(".end").addEventListener("change", () => { if ($(".end").value) update({ end: $(".end").value }); nextDay(); });
        li.querySelectorAll(".day").forEach((b) => b.addEventListener("click", () => {
          const d = Number(b.getAttribute("data-day"));
          const cur = getSettings().schedules.find((x) => x.id === s.id);
          if (!cur) return;
          const days = cur.days.includes(d) ? cur.days.filter((x) => x !== d) : [...cur.days, d];
          b.setAttribute("aria-pressed", String(days.includes(d)));
          update({ days });
        }));
      }
      li.querySelector(".del")?.addEventListener("click", () => {
        this._saveSchedules(getSettings().schedules.filter((x) => x.id !== s.id));
        this._renderSchedules(true);
        /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".sched-add"))?.focus();
      });
      ul.appendChild(li);
    });
    this._renderScheduleStatus();
  }

  _renderRegion() {
    const areas = getSettings().detectionAreas;
    const val = this.shadowRoot.querySelector(".region-val");
    const clear = /** @type {HTMLButtonElement | null} */ (this.shadowRoot.querySelector(".region-clear-btn"));
    if (val) {
      val.textContent = areas.length
        ? t("areasSummary", { count: areas.length, names: areas.map((a) => (a.enabled ? a.name : `${a.name} (${t("areaOff")})`)).join(", ") })
        : t("detectionAreaWhole");
    }
    if (clear) clear.disabled = !areas.length;
  }

  _saveAreas(areas) {
    updateSettings({ detectionAreas: areas });
    this._renderRegion();
    this.dispatchEvent(new CustomEvent("settings-changed", { bubbles: true, composed: true }));
  }

  /**
   * Live camera stream for the area editor: the running camera if any (shared, never stopped
   * here), else a temporary one that the caller must stop via `own`.
   * @returns {Promise<{ stream: MediaStream, own: boolean } | null>}
   */
  async _getStream() {
    const detail = { stream: null };
    this.dispatchEvent(new CustomEvent("request-stream", { bubbles: true, composed: true, detail }));
    if (detail.stream) return { stream: detail.stream, own: false };
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      return { stream: await navigator.mediaDevices.getUserMedia({ video: true }), own: true };
    } catch {
      return null;
    }
  }

  async _openAreaDialog(opener) {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `
      <div class="area-dialog" role="dialog" aria-modal="true" aria-labelledby="area-title" aria-describedby="area-hint">
        <h2 id="area-title"></h2>
        <p id="area-hint"></p>
        <area-editor></area-editor>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost whole"></button>
          <button type="button" class="btn btn-outline cancel"></button>
          <button type="button" class="btn btn-primary save"></button>
        </div>
      </div>`;
    const $ = (sel) => /** @type {HTMLElement} */ (backdrop.querySelector(sel));
    $("#area-title").textContent = t("areaDialogTitle");
    $("#area-hint").textContent = t("areaDrawHint");
    $(".whole").textContent = t("useWholeScreen");
    $(".cancel").textContent = t("cancel");
    $(".save").textContent = t("areaSave");
    const editor = /** @type {import("./area-editor.js").AreaEditor} */ (/** @type {unknown} */ ($("area-editor")));

    let ownStream = null;
    const close = this._modal(backdrop, opener, () => {
      editor.detachStream();
      ownStream?.getTracks().forEach((tr) => tr.stop());
    });
    $(".cancel").addEventListener("click", close);
    $(".whole").addEventListener("click", () => { editor.areas = []; });
    $(".save").addEventListener("click", () => {
      this._saveAreas(editor.areas);
      close();
    });
    // customElements upgrade happens on insertion (done by _modal)
    editor.areas = getSettings().detectionAreas;
    editor.setMessage(t("areaLoading"));
    editor.focusFirst();

    // Live "look through": the running camera feed (shared), else a temporary one
    const got = await this._getStream();
    if (!backdrop.isConnected) {
      if (got?.own) got.stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    if (!got) {
      editor.setMessage(t("areaNoPreview"));
      return;
    }
    if (got.own) ownStream = got.stream;
    editor.attachStream(got.stream);
  }

  /** Modal helper: Tab trap (also through shadow roots), Escape to close, focus back to the opener. */
  _modal(root, opener, onClose) {
    const close = () => {
      onClose?.();
      root.remove();
      if (opener?.isConnected) opener.focus();
    };
    const focusables = (node, out = []) => {
      for (const el of /** @type {HTMLElement[]} */ ([...node.children])) {
        if (el.shadowRoot) focusables(el.shadowRoot, out);
        const ok = el.matches("button, input, select, textarea, [tabindex]") &&
          !(/** @type {any} */ (el).disabled) && el.getAttribute("tabindex") !== "-1" && !el.hidden &&
          !el.closest("[hidden]") && /** @type {any} */ (el).type !== "hidden";
        if (ok) out.push(el);
        if (!el.shadowRoot) focusables(el, out);
      }
      return out;
    };
    const deepActive = () => {
      let a = this.shadowRoot.activeElement;
      while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
      return a;
    };
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const els = focusables(root);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      const active = deepActive();
      if (e.shiftKey && (active === first || !els.includes(/** @type {any} */ (active)))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });
    this.shadowRoot.appendChild(root);
    return close;
  }

  async _refreshStorage() {
    this._renderScheduleStatus();
    const el = this.shadowRoot.querySelector(".storage-val");
    if (!el) return;
    try {
      const used = await getStorageUsage();
      const est = await estimateQuota();
      let text = formatBytes(used);
      if (est?.quota) {
        text += ` / ${formatBytes(est.quota)}`;
      }
      el.textContent = text;
    } catch {
      el.textContent = t("storageUnknown");
    }
  }
}

customElements.define("motion-settings", MotionSettings);
