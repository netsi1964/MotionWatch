import { t, onLocaleChange, formatDateTime, formatDuration, formatBytes } from "../services/i18n.js";
import { listRecordings, deleteRecording, deleteRecordings } from "../services/storage.js";
import { createZip, downloadBlob } from "../services/zip.js";
import { concatClips, MAX_SPEED } from "../services/concat.js";
import { extensionForMime } from "../services/capabilities.js";
import { sharedCss } from "../styles/shared.js";
import { icon } from "./icons.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host { display: flex; flex-direction: column; height: 100%; container-type: size; background: var(--mw-bg); }
    .toolbar {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--mw-space-2) var(--mw-space-3);
      padding: var(--mw-space-2) var(--mw-space-4) var(--mw-space-3);
    }
    .heading { flex: 1 1 10rem; min-width: 0; }
    h2 { margin: 0; font-size: var(--mw-text-xl); letter-spacing: -0.02em; }
    .count { font-size: var(--mw-text-sm); color: var(--mw-text-muted); margin: 0; }
    .tools { display: flex; flex-wrap: wrap; gap: var(--mw-space-2); }
    .list {
      flex: 1; overflow-y: auto; padding: 0 var(--mw-space-4) var(--mw-space-6);
      display: grid; gap: var(--mw-space-4); align-content: start;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.5rem), 1fr));
    }
    .card { overflow: hidden; display: flex; flex-direction: column; transition: border-color var(--mw-transition), transform var(--mw-transition); }
    .card[data-selected="true"] { border-color: var(--mw-accent); box-shadow: 0 0 0 1px var(--mw-accent); }
    .thumb { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; padding: 0; overflow: hidden; line-height: 0; }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 300ms ease; }
    .thumb:hover img, .thumb:hover video { transform: scale(1.04); }
    .play {
      position: absolute; inset: 0; display: grid; place-items: center; line-height: 1; color: #fff;
      background: linear-gradient(to top, rgba(0,0,0,0.45), transparent 55%);
    }
    .play span { display: grid; place-items: center; width: 3rem; height: 3rem; border-radius: 50%; background: rgba(0,0,0,0.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); transition: transform var(--mw-transition), background var(--mw-transition); }
    .thumb:hover .play span { transform: scale(1.1); background: var(--mw-accent); }
    .duration { position: absolute; right: 0.5rem; bottom: 0.5rem; line-height: 1.4; font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 4px; }
    .duration .ico { width: 0.95rem; height: 0.95rem; }
    input[type="checkbox"].check.sel { position: absolute; left: 0.5rem; top: 0.5rem; z-index: 1; }
    .body { display: flex; align-items: center; gap: var(--mw-space-2); padding: var(--mw-space-3) var(--mw-space-3) var(--mw-space-3) var(--mw-space-4); }
    .meta { flex: 1; min-width: 0; }
    .meta time { display: block; font-size: var(--mw-text-sm); font-weight: 700; letter-spacing: -0.01em; }
    .meta .sub { font-size: var(--mw-text-xs); color: var(--mw-text-muted); font-variant-numeric: tabular-nums; }
    .actions { display: flex; gap: 2px; }
    .actions .btn-icon { width: 2.5rem; min-height: 2.5rem; color: var(--mw-text-muted); }
    .actions .btn-icon:hover:not(:disabled) { color: var(--mw-text); }
    .actions .del:hover:not(:disabled) { color: var(--mw-danger-text); }

    .empty { margin: auto; text-align: center; color: var(--mw-text-muted); padding: var(--mw-space-8) var(--mw-space-4); max-width: 22rem; display: flex; flex-direction: column; align-items: center; gap: var(--mw-space-3); }
    .empty .badge { display: grid; place-items: center; width: 4.5rem; height: 4.5rem; border-radius: 50%; background: var(--mw-surface-2); color: var(--mw-text-muted); }
    .empty .badge .ico { width: 2rem; height: 2rem; }
    .empty p { margin: 0; }
    .empty .title { color: var(--mw-text); font-weight: 700; font-size: var(--mw-text-lg); }

    .dialog-backdrop {
      position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
      padding: var(--mw-space-4); background: rgba(5,6,10,0.7);
      -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: fade 160ms ease-out;
    }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    .dialog { background: var(--mw-surface); border: 1px solid var(--mw-border); border-radius: var(--mw-radius-lg); padding: var(--mw-space-5); max-width: 22rem; width: 100%; box-shadow: var(--mw-shadow); }
    .progress { height: 10px; border-radius: var(--mw-radius-full); background: var(--mw-surface-3); overflow: hidden; margin: var(--mw-space-3) 0; }
    .progress .bar { display: block; height: 100%; width: 0%; background: var(--mw-accent); border-radius: inherit; transition: width 200ms linear; }
    .dialog .status { margin: 0 0 var(--mw-space-2); font-size: var(--mw-text-sm); font-weight: 600; font-variant-numeric: tabular-nums; }
    .dialog .hint { margin: 0 0 var(--mw-space-4); font-size: var(--mw-text-sm); font-weight: 400; color: var(--mw-text-muted); }
    .dialog p { margin: 0 0 var(--mw-space-5); font-size: var(--mw-text-base); font-weight: 600; }
    .dialog-actions { display: flex; gap: var(--mw-space-2); justify-content: flex-end; }
    .player { width: min(960px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: var(--mw-space-3); }
    .player video { width: 100%; max-height: calc(100dvh - 9rem); background: #000; border-radius: var(--mw-radius-lg); }
    .player-bar { display: flex; align-items: center; gap: var(--mw-space-2); color: #fff; }
    .player-bar .title { flex: 1; min-width: 0; font-weight: 700; }
    .player-bar .btn { background: rgba(255,255,255,0.14); color: #fff; }
    .player-bar .pos { font-variant-numeric: tabular-nums; font-size: var(--mw-text-sm); opacity: 0.8; }
    .player-bar .btn-icon-only { width: var(--mw-touch-min); padding: 0; }
    .opt { display: flex; align-items: center; justify-content: space-between; gap: var(--mw-space-3); font-weight: 600; font-size: var(--mw-text-base); margin: var(--mw-space-3) 0; }
    .tl-opts { display: flex; flex-direction: column; gap: var(--mw-space-3); margin-bottom: var(--mw-space-3); }
    .tl-field { display: flex; align-items: center; justify-content: space-between; gap: var(--mw-space-3); font-size: var(--mw-text-sm); font-weight: 600; }
    .tl-field select, .tl-field input { width: 8rem; }
    .dialog { max-width: 26rem; }
    .player-bar .btn:hover:not(:disabled) { background: rgba(255,255,255,0.26); }

    @container (max-width: 520px) {
      .toolbar { padding-inline: var(--mw-space-3); }
      .list { padding-inline: var(--mw-space-3); gap: var(--mw-space-3); }
      .tools .btn .txt { display: none; }
      .tools .btn { padding: 0; width: var(--mw-touch-min); }
    }
  </style>
  <div class="toolbar">
    <div class="heading"><h2 class="title"></h2><p class="count" role="status"></p></div>
    <div class="tools">
      <button type="button" class="btn btn-outline select-all-btn">${icon("check")}<span class="txt"></span></button>
      <button type="button" class="btn btn-danger delete-sel-btn" disabled>${icon("trash")}<span class="txt"></span></button>
      <button type="button" class="btn merge-btn" disabled>${icon("film")}<span class="txt"></span></button>
      <button type="button" class="btn zip-btn" disabled>${icon("download")}<span class="txt"></span></button>
    </div>
  </div>
  <div class="list" role="list"></div>
  <div class="empty" hidden>
    <span class="badge">${icon("film")}</span>
    <p class="title"></p>
    <p class="hint"></p>
  </div>
`;

export class RecordingList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {import('../services/storage.js').RecordingMeta[]} */
    this._items = [];
    /** @type {Set<string>} */
    this._selected = new Set();
    /** @type {string[]} object URLs to release on re-render */
    this._urls = [];
    this._unsub = null;
  }

  connectedCallback() {
    this._bind();
    this.refresh();
    this._unsub = onLocaleChange(() => {
      this._renderToolbar();
      this._renderList();
    });
  }

  disconnectedCallback() {
    this._unsub?.();
    this._releaseUrls();
  }

  _toast(message, kind = "info") {
    this.dispatchEvent(new CustomEvent("toast", { bubbles: true, composed: true, detail: { message, kind } }));
  }

  _bind() {
    const q = (s) => this.shadowRoot.querySelector(s);
    q(".select-all-btn").addEventListener("click", () => {
      if (this._selected.size === this._items.length) this._selected.clear();
      else this._items.forEach((r) => this._selected.add(r.id));
      this._renderList();
      this._renderToolbar();
    });
    q(".delete-sel-btn").addEventListener("click", (e) => this._confirmDelete([...this._selected], e.currentTarget));
    q(".zip-btn").addEventListener("click", () => this._exportZip());
    q(".merge-btn").addEventListener("click", (e) => this._combine(e.currentTarget));
  }

  async refresh() {
    try {
      this._items = await listRecordings();
    } catch {
      this._items = [];
    }
    for (const id of [...this._selected]) {
      if (!this._items.find((r) => r.id === id)) this._selected.delete(id);
    }
    this._renderToolbar();
    this._renderList();
  }

  _renderToolbar() {
    const q = (s) => /** @type {HTMLElement} */ (this.shadowRoot.querySelector(s));
    const all = this._selected.size === this._items.length && this._items.length > 0;
    q(".title").textContent = t("tabRecordings");
    q(".count").textContent = this._selected.size
      ? t("selectedCount", { count: this._selected.size })
      : t("recordingsCount", { count: this._items.length });
    q(".select-all-btn .txt").textContent = all ? t("deselectAll") : t("selectAll");
    q(".select-all-btn").setAttribute("aria-label", all ? t("deselectAll") : t("selectAll"));
    q(".delete-sel-btn .txt").textContent = t("deleteSelected");
    q(".delete-sel-btn").setAttribute("aria-label", t("deleteSelected"));
    /** @type {HTMLButtonElement} */ (q(".delete-sel-btn")).disabled = this._selected.size === 0;
    q(".merge-btn .txt").textContent = t("combineSelected");
    q(".merge-btn").setAttribute("aria-label", t("combineSelected"));
    q(".merge-btn").title = this._selected.size < 2 ? t("combineNeedTwo") : t("combineSelected");
    /** @type {HTMLButtonElement} */ (q(".merge-btn")).disabled = this._selected.size < 2;
    q(".zip-btn .txt").textContent = t("exportZip");
    q(".zip-btn").setAttribute("aria-label", t("exportZip"));
    /** @type {HTMLButtonElement} */ (q(".zip-btn")).disabled = this._items.length === 0;
    /** @type {HTMLButtonElement} */ (q(".select-all-btn")).disabled = this._items.length === 0;
  }

  _releaseUrls() {
    this._urls.forEach((u) => URL.revokeObjectURL(u));
    this._urls = [];
  }

  _url(blob) {
    const u = URL.createObjectURL(blob);
    this._urls.push(u);
    return u;
  }

  _renderList() {
    const list = this.shadowRoot.querySelector(".list");
    const empty = /** @type {HTMLElement} */ (this.shadowRoot.querySelector(".empty"));
    if (!list) return;
    this._releaseUrls();
    list.innerHTML = "";
    empty.hidden = this._items.length > 0;
    /** @type {HTMLElement} */ (list).hidden = this._items.length === 0;
    empty.querySelector(".title").textContent = t("noRecordings");
    empty.querySelector(".hint").textContent = t("noRecordingsHint");
    if (!this._items.length) return;

    for (const rec of this._items) {
      const when = formatDateTime(new Date(rec.createdAt));
      const card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role", "listitem");
      card.dataset.selected = String(this._selected.has(rec.id));

      // preview: stored poster frame, else the first frame of the clip
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "thumb";
      thumb.setAttribute("aria-label", t("a11yPlayItem", { date: when }));
      let media;
      if (rec.poster) {
        media = document.createElement("img");
        media.alt = "";
        media.loading = "lazy";
        media.decoding = "async";
        media.src = this._url(rec.poster);
      } else {
        media = document.createElement("video");
        media.muted = true;
        media.playsInline = true;
        media.preload = "metadata";
        media.setAttribute("aria-hidden", "true");
        media.tabIndex = -1;
        media.src = this._url(rec.blob);
        media.addEventListener("loadeddata", () => { try { media.currentTime = 0.1; } catch { /* */ } });
      }
      const play = document.createElement("span");
      play.className = "play";
      play.innerHTML = `<span>${icon("play")}</span>`;
      const dur = document.createElement("span");
      dur.className = "duration pill-dark";
      dur.textContent = formatDuration(rec.durationSec);
      if (rec.hasAudio) {
        dur.innerHTML = `${icon("mic")}<span></span>`;
        dur.querySelector("span").textContent = formatDuration(rec.durationSec);
        dur.title = t("withSound");
      }
      thumb.append(media, play, dur);
      thumb.addEventListener("click", (e) => this._play(rec, /** @type {HTMLElement} */ (e.currentTarget)));

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "check sel";
      check.checked = this._selected.has(rec.id);
      check.setAttribute("aria-label", t("a11ySelectItem", { date: when }));
      check.addEventListener("change", () => {
        if (check.checked) this._selected.add(rec.id);
        else this._selected.delete(rec.id);
        card.dataset.selected = String(check.checked);
        this._renderToolbar();
      });
      const media_wrap = document.createElement("div");
      media_wrap.style.position = "relative";
      media_wrap.append(thumb, check);

      const body = document.createElement("div");
      body.className = "body";
      const meta = document.createElement("div");
      meta.className = "meta";
      const time = document.createElement("time");
      time.dateTime = new Date(rec.createdAt).toISOString();
      time.textContent = when;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${formatBytes(rec.sizeBytes)}${rec.height ? ` · ${rec.height}p` : ""}${rec.hasAudio ? ` · ${t("withSound")}` : ""}`;
      meta.append(time, sub);

      const actions = document.createElement("div");
      actions.className = "actions";
      const dl = document.createElement("button");
      dl.type = "button";
      dl.className = "btn btn-ghost btn-icon";
      dl.innerHTML = icon("download");
      dl.title = t("download");
      dl.setAttribute("aria-label", t("a11yDownloadItem", { date: when }));
      dl.addEventListener("click", () => this._downloadOne(rec));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-ghost btn-icon del";
      del.innerHTML = icon("trash");
      del.title = t("delete");
      del.setAttribute("aria-label", t("a11yDeleteItem", { date: when }));
      del.addEventListener("click", (e) => this._confirmDelete([rec.id], /** @type {HTMLElement} */ (e.currentTarget)));
      actions.append(dl, del);

      body.append(meta, actions);
      card.append(media_wrap, body);
      list.appendChild(card);
    }
  }

  /** Trap Tab inside `root`, close on Escape, restore focus to `opener`. */
  _modal(root, opener, onClose) {
    const close = () => {
      onClose?.();
      root.remove();
      if (opener?.isConnected) opener.focus();
      else /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(".select-all-btn"))?.focus();
    };
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const els = /** @type {HTMLElement[]} */ ([...root.querySelectorAll("button, video[controls], input, select")].filter((el) => !el.disabled && !el.closest("[hidden]")));
      const first = els[0], last = els[els.length - 1];
      const active = this.shadowRoot.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });
    this.shadowRoot.appendChild(root);
    return close;
  }

  /** Player with previous/next (buttons and ←/→, in list order). Shift+←/→ seeks 5 s. */
  _play(rec, opener) {
    let index = Math.max(0, this._items.findIndex((r) => r.id === rec.id));
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `
      <div class="player" role="dialog" aria-modal="true">
        <video controls autoplay playsinline></video>
        <div class="player-bar">
          <button type="button" class="btn prev">${icon("chevronLeft")}<span class="sr-only"></span></button>
          <span class="title" role="status" aria-live="polite"></span>
          <span class="pos"></span>
          <button type="button" class="btn next">${icon("chevronRight")}<span class="sr-only"></span></button>
          <button type="button" class="btn dl">${icon("download")}<span class="lbl"></span></button>
          <button type="button" class="btn close">${icon("x")}<span class="lbl"></span></button>
        </div>
      </div>`;
    const $ = (sel) => /** @type {HTMLElement} */ (backdrop.querySelector(sel));
    $(".prev .sr-only").textContent = t("prevClip");
    $(".next .sr-only").textContent = t("nextClip");
    $(".prev").title = `${t("prevClip")} (←)`;
    $(".next").title = `${t("nextClip")} (→)`;
    $(".dl .lbl").textContent = t("download");
    $(".close .lbl").textContent = t("close");
    const video = /** @type {HTMLVideoElement} */ ($("video"));
    const prev = /** @type {HTMLButtonElement} */ ($(".prev"));
    const next = /** @type {HTMLButtonElement} */ ($(".next"));
    let url = "";

    const show = (i) => {
      index = Math.min(this._items.length - 1, Math.max(0, i));
      const cur = this._items[index];
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(cur.blob);
      video.src = url;
      video.play().catch(() => {});
      const when = formatDateTime(new Date(cur.createdAt));
      $(".player").setAttribute("aria-label", when);
      $(".title").textContent = when;
      $(".pos").textContent = `${index + 1} / ${this._items.length}`;
      prev.disabled = index === 0;
      next.disabled = index === this._items.length - 1;
    };
    const step = (d) => {
      const target = index + d;
      if (target < 0 || target >= this._items.length) return;
      show(target);
      // keep keyboard focus on a live control when the one just used becomes disabled
      if ((d < 0 && prev.disabled) || (d > 0 && next.disabled)) (d < 0 ? next : prev).focus();
    };

    const close = this._modal(backdrop, opener, () => { video.pause(); video.removeAttribute("src"); video.load(); if (url) URL.revokeObjectURL(url); });
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    $(".close").addEventListener("click", close);
    $(".dl").addEventListener("click", () => this._downloadOne(this._items[index]));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    backdrop.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (/** @type {Element} */ (e.target).closest?.("input, select")) return;
      e.preventDefault();                       // do not let the native controls seek instead
      if (e.shiftKey) video.currentTime = Math.max(0, video.currentTime + (e.key === "ArrowRight" ? 5 : -5));
      else step(e.key === "ArrowRight" ? 1 : -1);
    });
    show(index);
    $(".close").focus();
  }

  _fileName(rec) {
    return `motionwatch-${new Date(rec.createdAt).toISOString().replace(/[:.]/g, "-")}.${extensionForMime(rec.mimeType)}`;
  }

  _downloadOne(rec) {
    downloadBlob(rec.blob, this._fileName(rec));
  }

  /**
   * Combine the selected clips (oldest first) into one video, optionally with a timelapse version
   * (choose a speed-up or a target length). One result downloads directly, two come as a ZIP.
   */
  async _combine(opener) {
    const targets = this._items.filter((r) => this._selected.has(r.id)).sort((a, b) => a.createdAt - b.createdAt);
    if (targets.length < 2) return;
    const total = targets.reduce((s, r) => s + (r.durationSec || 0), 0);
    const fmt = (s) => formatDuration(Math.round(s));
    const minLen = Math.max(1, Math.ceil(total / MAX_SPEED));

    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="mg-title">
        <p id="mg-title"></p>
        <div class="stage-options">
          <p class="status total"></p>
          <label class="opt"><span class="main-label"></span><input type="checkbox" class="switch main-on" checked></label>
          <div class="tl-field gap-field"><label for="gap-in"></label><input id="gap-in" type="number" min="0" max="5" step="0.1" value="0.3"></div>
          <label class="opt"><span class="tl-label"></span><input type="checkbox" class="switch tl-on"></label>
          <div class="tl-opts" hidden>
            <div class="seg" role="radiogroup" aria-labelledby="mg-title">
              <label><input type="radio" name="tlmode" value="speed" checked><span class="m-speed"></span></label>
              <label><input type="radio" name="tlmode" value="length"><span class="m-length"></span></label>
            </div>
            <div class="tl-field tl-speed"><label for="tl-speed"></label>
              <select id="tl-speed">${[2, 4, 8, 16].map((n) => `<option value="${n}"${n === 8 ? " selected" : ""}>×${n}</option>`).join("")}</select></div>
            <div class="tl-field tl-length" hidden><label for="tl-length"></label>
              <input id="tl-length" type="number" min="${minLen}" max="${Math.max(minLen, Math.floor(total / 1.5))}" step="1" value="${Math.max(minLen, Math.min(30, Math.round(total / 8)))}"></div>
            <p class="hint tl-summary" role="status"></p>
          </div>
          <p class="hint need-one" role="alert" hidden></p>
          <p class="hint realtime"></p>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost cancel-opts"></button>
            <button type="button" class="btn btn-primary start"></button>
          </div>
        </div>
        <div class="stage-progress" hidden>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-labelledby="mg-title"><span class="bar"></span></div>
          <p class="status phase" role="status"></p>
          <p class="hint realtime2"></p>
          <div class="dialog-actions"><button type="button" class="btn btn-outline cancel"></button></div>
        </div>
      </div>`;
    const $ = (sel) => /** @type {HTMLElement} */ (backdrop.querySelector(sel));
    $("#mg-title").textContent = t("combineTitle", { count: targets.length });
    const mainOn = /** @type {HTMLInputElement} */ ($(".main-on"));
    const gapIn = /** @type {HTMLInputElement} */ ($("#gap-in"));
    const gapNow = () => Math.min(5, Math.max(0, Number(gapIn.value) || 0));
    const showTotal = () => { $(".total").textContent = t("combineTotal", { total: fmt(total + (mainOn.checked ? gapNow() : 0) * (targets.length - 1)) }); };
    showTotal();
    $(".gap-field label").textContent = t("combineGap");
    $(".main-label").textContent = t("combinedName");
    $(".tl-label").textContent = t("timelapseName");
    $(".m-speed").textContent = t("tlSpeed");
    $(".m-length").textContent = t("tlLength");
    $(".tl-speed label").textContent = t("tlSpeedLabel");
    $(".tl-length label").textContent = t("tlLengthLabel");
    $(".need-one").textContent = t("combineNeedOne");
    $(".realtime").textContent = t("combineHint");
    $(".realtime2").textContent = t("combineHint");
    $(".cancel-opts").textContent = t("cancel");
    $(".cancel").textContent = t("cancel");
    $(".start").textContent = t("combineStart");

    const tlOn = /** @type {HTMLInputElement} */ ($(".tl-on"));
    const speedSel = /** @type {HTMLSelectElement} */ ($("#tl-speed"));
    const lenIn = /** @type {HTMLInputElement} */ ($("#tl-length"));
    const modeOf = () => /** @type {HTMLInputElement} */ (backdrop.querySelector('input[name="tlmode"]:checked')).value;
    /** Speed to use for the timelapse, from the chosen mode (clamped to what playback can do). */
    const speedNow = () => {
      if (modeOf() === "speed") return Number(speedSel.value);
      const len = Math.max(1, Number(lenIn.value) || minLen);
      return Math.min(MAX_SPEED, Math.max(1.5, total / len));
    };
    const refresh = () => {
      showTotal();
      $(".gap-field").hidden = !mainOn.checked;                 // the gap only belongs to the combined video
      /** @type {HTMLButtonElement} */ ($(".start")).disabled = !mainOn.checked && !tlOn.checked;
      $(".need-one").hidden = mainOn.checked || tlOn.checked;
      $(".tl-opts").hidden = !tlOn.checked;
      $(".tl-speed").hidden = modeOf() !== "speed";
      $(".tl-length").hidden = modeOf() !== "length";
      const sp = speedNow();
      const raw = modeOf() === "length" ? total / Math.max(1, Number(lenIn.value) || minLen) : sp;
      $(".tl-summary").textContent = t("tlSummary", { speed: Number.isInteger(sp) ? sp : sp.toFixed(1), length: fmt(total / sp) })
        + (raw > MAX_SPEED ? ` ${t("tlClamped", { max: MAX_SPEED })}` : "");
    };
    backdrop.addEventListener("input", refresh);
    backdrop.addEventListener("change", refresh);
    refresh();

    const ac = new AbortController();
    const close = this._modal(backdrop, opener, () => ac.abort());
    $(".cancel-opts").addEventListener("click", close);
    $(".cancel").addEventListener("click", close);
    $(".start").focus();

    $(".start").addEventListener("click", async () => {
      const wantMain = mainOn.checked, wantTimelapse = tlOn.checked;
      if (!wantMain && !wantTimelapse) return;
      const speed = wantTimelapse ? speedNow() : 1;
      $(".stage-options").hidden = true;
      $(".stage-progress").hidden = false;
      $("#mg-title").textContent = t("combiningTitle", { count: targets.length });
      const bar = $(".bar"), track = $(".progress"), phase = $(".phase");
      $(".cancel").focus();
      const steps = (wantMain ? 1 : 0) + (wantTimelapse ? 1 : 0);
      let step = 0;
      const run = async (label, sp, gapSec = 0) => {
        step += 1;
        bar.style.width = "0%";
        return concatClips(targets, {
          signal: ac.signal,
          speed: sp,
          gapSec,
          onProgress: ({ done, total: tot, index, count }) => {
            const pct = tot ? Math.min(100, Math.round((done / tot) * 100)) : 0;
            bar.style.width = `${pct}%`;
            track.setAttribute("aria-valuenow", String(pct));
            const clip = t("combineStatus", { i: index + 1, n: count, done: fmt(done), total: fmt(tot) });
            phase.textContent = steps > 1 ? `${t("combinePhase", { step, steps, what: label })} · ${clip}` : clip;
          },
        });
      };
      try {
        const stamp = Date.now();
        const files = [];
        if (wantMain) {
          const main = await run(t("combinedName"), 1, gapNow());
          files.push({ name: `motionwatch-combined-${stamp}.${main.extension}`, data: main.blob });
        }
        if (wantTimelapse) {
          const tl = await run(t("timelapseName"), speed);
          files.push({ name: `motionwatch-timelapse-${stamp}.${tl.extension}`, data: tl.blob });
        }
        if (files.length === 1) {
          // a single result is downloaded as is, no ZIP
          downloadBlob(files[0].data, files[0].name);
          this._toast(t(wantMain ? "combineDone" : "timelapseDone"));
        } else {
          downloadBlob(await createZip(files), `motionwatch-combined-${stamp}.zip`);
          this._toast(t("combineZipDone"));
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error(err);
          this._toast(t("combineFailed"), "error");
        }
      } finally {
        if (backdrop.isConnected) close();
      }
    });
  }

  async _exportZip() {
    const targets = this._selected.size ? this._items.filter((r) => this._selected.has(r.id)) : this._items;
    if (!targets.length) return;
    try {
      const zipBlob = await createZip(targets.map((r) => ({ name: this._fileName(r), data: r.blob })));
      downloadBlob(zipBlob, `motionwatch-export-${Date.now()}.zip`);
    } catch (err) {
      console.error(err);
      this._toast(t("errorGeneric"), "error");
    }
  }

  _confirmDelete(ids, opener) {
    if (!ids.length) return;
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";
    backdrop.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-describedby="dlg-msg">
        <p id="dlg-msg"></p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost cancel"></button>
          <button type="button" class="btn btn-primary confirm"></button>
        </div>
      </div>`;
    backdrop.querySelector("p").textContent = ids.length > 1 ? t("deleteConfirmBulk") : t("deleteConfirm");
    const cancel = /** @type {HTMLButtonElement} */ (backdrop.querySelector(".cancel"));
    const confirm = /** @type {HTMLButtonElement} */ (backdrop.querySelector(".confirm"));
    cancel.textContent = t("cancel");
    confirm.textContent = t("confirm");
    const close = this._modal(backdrop, opener);
    cancel.addEventListener("click", close);
    confirm.addEventListener("click", async () => {
      close();
      try {
        if (ids.length === 1) await deleteRecording(ids[0]);
        else await deleteRecordings(ids);
        ids.forEach((id) => this._selected.delete(id));
        await this.refresh();
        this._toast(t("deletedToast", { count: ids.length }));
      } catch {
        this._toast(t("errorGeneric"), "error");
      }
    });
    cancel.focus();
  }
}

customElements.define("recording-list", RecordingList);
