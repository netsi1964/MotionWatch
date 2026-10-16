import { t, onLocaleChange } from "../services/i18n.js";
import { sharedCss, syncRange } from "../styles/shared.js";
import { getSettings } from "../services/settings.js";
import { icon } from "./icons.js";
import {
  MIN_SIZE, MAX_AREAS, MAX_POINTS, colorFor, newId, cloneArea, bbox, setBBox, moveArea,
  convertShape, addPoint, shapeElement, normalizeAreas,
} from "../services/areas.js";

const template = document.createElement("template");
template.innerHTML = `
  <style>${sharedCss}</style>
  <style>
    :host { display: block; }
    .stage {
      position: sticky; top: 0; z-index: 3; /* stays visible while editing the fields below */
      width: 100%; background: #000; overflow: hidden; touch-action: none; cursor: crosshair;
      border-radius: var(--mw-radius); margin-bottom: var(--mw-space-3); user-select: none; -webkit-user-select: none;
      box-shadow: 0 0 0 1px var(--mw-border);
    }
    .stage video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
    .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .stage svg .shape { cursor: move; pointer-events: all; }
    .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--mw-space-4); text-align: center; color: #cfd3df; font-size: var(--mw-text-sm); pointer-events: none; }
    .label { position: absolute; transform: translate(0, -100%); pointer-events: none; white-space: nowrap; font-size: var(--mw-text-xs); font-weight: 700; padding: 1px 7px; border-radius: 6px 6px 6px 0; color: #000; max-width: 60%; overflow: hidden; text-overflow: ellipsis; }
    .handle {
      position: absolute; width: 18px; height: 18px; transform: translate(-50%, -50%); padding: 0; z-index: 2; touch-action: none;
      background: #fff; border: 2px solid #111; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .handle.vertex { border-radius: 50%; }
    .handle.mid { width: 12px; height: 12px; opacity: 0.75; border-radius: 50%; }
    .handle.move { border-radius: 50%; width: 28px; height: 28px; cursor: move; display: grid; place-items: center; font-size: 14px; line-height: 1; color: #111; }
    .handle[data-h="n"], .handle[data-h="s"] { cursor: ns-resize; }
    .handle[data-h="e"], .handle[data-h="w"] { cursor: ew-resize; }
    .handle[data-h="nw"], .handle[data-h="se"] { cursor: nwse-resize; }
    .handle[data-h="ne"], .handle[data-h="sw"] { cursor: nesw-resize; }
    .handle.vertex, .handle.mid { cursor: pointer; }

    .toolbar, .btn-row { display: flex; flex-wrap: wrap; gap: var(--mw-space-2); margin-bottom: var(--mw-space-3); }
    ul { list-style: none; margin: 0 0 var(--mw-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--mw-space-2); }
    li.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mw-space-2) var(--mw-space-3); padding: var(--mw-space-2) var(--mw-space-3); border: 1px solid var(--mw-border); border-radius: var(--mw-radius); background: var(--mw-surface-2); }
    li.row[data-selected="true"] { border-color: var(--mw-text); box-shadow: 0 0 0 1px var(--mw-text); }
    .swatch { width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0; }
    .name { flex: 1 1 8rem; min-width: 0; width: auto; min-height: 40px; }
    .shape-tag { font-size: var(--mw-text-xs); color: var(--mw-text-muted); font-weight: 600; }
    .active-label { display: inline-flex; align-items: center; gap: var(--mw-space-2); font-size: var(--mw-text-sm); font-weight: 600; }
    .sens-block { display: flex; flex-direction: column; gap: var(--mw-space-2); margin-bottom: var(--mw-space-3); }
    .sens-head { display: flex; justify-content: space-between; align-items: baseline; }
    .sens-head label.f { margin: 0; }
    .sens-out { font-variant-numeric: tabular-nums; font-size: var(--mw-text-sm); font-weight: 600; color: var(--mw-text-muted); }
    .inherit { display: inline-flex; align-items: center; gap: var(--mw-space-2); font-size: var(--mw-text-sm); font-weight: 600; }
    .empty { color: var(--mw-text-muted); font-size: var(--mw-text-sm); margin: 0 0 var(--mw-space-3); }
    fieldset.detail { border: 1px solid var(--mw-border); border-radius: var(--mw-radius); padding: var(--mw-space-3); margin: 0 0 var(--mw-space-3); min-width: 0; }
    fieldset.detail legend { padding: 0 6px; font-size: var(--mw-text-sm); font-weight: 700; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr)); gap: var(--mw-space-2); margin-bottom: var(--mw-space-2); }
    label.f { display: block; font-size: var(--mw-text-xs); font-weight: 700; color: var(--mw-text-muted); margin-bottom: 2px; }
  </style>
  <div class="stage" style="aspect-ratio:16/9" tabindex="-1">
    <span class="msg" role="status"></span>
  </div>
  <div class="toolbar" role="group">
    <button type="button" class="btn btn-outline btn-sm add-rect"></button>
    <button type="button" class="btn btn-outline btn-sm add-ellipse"></button>
    <button type="button" class="btn btn-outline btn-sm add-polygon"></button>
  </div>
  <p class="empty" hidden></p>
  <ul class="list"></ul>
  <fieldset class="detail" hidden>
    <legend></legend>
    <div class="fields">
      <div><label class="f f-shape-l" for="ae-shape"></label>
        <select id="ae-shape"><option value="rect"></option><option value="ellipse"></option><option value="polygon"></option></select></div>
      <div><label class="f f-x-l" for="ae-x"></label><input id="ae-x" type="number" min="0" max="96" step="1"></div>
      <div><label class="f f-y-l" for="ae-y"></label><input id="ae-y" type="number" min="0" max="96" step="1"></div>
      <div><label class="f f-w-l" for="ae-w"></label><input id="ae-w" type="number" min="4" max="100" step="1"></div>
      <div><label class="f f-h-l" for="ae-h"></label><input id="ae-h" type="number" min="4" max="100" step="1"></div>
    </div>
    <div class="sens-block">
      <div class="sens-head"><label class="f f-sens-l" for="ae-sens"></label><span class="sens-out" aria-hidden="true"></span></div>
      <input id="ae-sens" type="range" min="0" max="100" step="1">
      <label class="inherit"><input type="checkbox" class="switch" id="ae-inherit"><span class="f-inherit-l"></span></label>
    </div>
    <div class="btn-row poly-actions" hidden>
      <button type="button" class="btn btn-outline btn-sm add-point"></button>
    </div>
  </fieldset>
`;

const DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DIR_POS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const DIR_KEY = { nw: "dirNW", n: "dirN", ne: "dirNE", e: "dirE", se: "dirSE", s: "dirS", sw: "dirSW", w: "dirW" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Editor for detection areas on top of a live video feed. Areas can be drawn
 * (drag on empty space), moved (drag a shape or its centre handle), reshaped
 * (corner/edge handles, polygon points) and converted between shapes.
 * Everything is also reachable by keyboard.
 */
export class AreaEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    /** @type {import("../services/areas.js").Area[]} */
    this._areas = [];
    /** @type {string | null} */
    this._sel = null;
    this._drag = null;
    this._unsub = null;
  }

  /** Current areas (deep copy). */
  get areas() {
    return normalizeAreas(this._areas.map(cloneArea));
  }

  set areas(list) {
    this._areas = normalizeAreas(list).map(cloneArea);
    this._sel = this._areas[0]?.id ?? null;
    this._render();
  }

  connectedCallback() {
    this._bind();
    this._labels();
    this._render();
    this._unsub = onLocaleChange(() => { this._labels(); this._render(); });
  }

  disconnectedCallback() {
    this._unsub?.();
    this.detachStream();
  }

  /** Show a camera stream behind the shapes; stage takes the video's aspect ratio. */
  attachStream(stream) {
    const stage = this._stage();
    this.detachStream();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    video.setAttribute("aria-hidden", "true");
    video.addEventListener("loadedmetadata", () => {
      stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      this._msg("");
    });
    stage.prepend(video);
    video.play().catch(() => {});
  }

  detachStream() {
    const v = this.shadowRoot.querySelector("video");
    if (v) { v.srcObject = null; v.remove(); }
  }

  setMessage(text) { this._msg(text); }

  /** Focus the first control without scrolling the page. */
  focusFirst() {
    /** @type {HTMLElement} */ (this._q(".add-rect")).focus({ preventScroll: true });
  }

  // ---- internals ---------------------------------------------------------

  _q(sel) { return /** @type {HTMLElement} */ (this.shadowRoot.querySelector(sel)); }
  _stage() { return this._q(".stage"); }
  _msg(text) { const m = this._q(".msg"); m.textContent = text; }
  _area(id = this._sel) { return this._areas.find((a) => a.id === id) || null; }
  _index(id) { return this._areas.findIndex((a) => a.id === id); }

  _labels() {
    const q = (s, k) => (this._q(s).textContent = t(k));
    q(".add-rect", "addRectangle");
    q(".add-ellipse", "addEllipse");
    q(".add-polygon", "addPolygon");
    q(".add-point", "addPoint");
    q(".f-shape-l", "areaShape");
    q(".f-x-l", "areaLeft");
    q(".f-y-l", "areaTop");
    q(".f-w-l", "areaWidth");
    q(".f-h-l", "areaHeight");
    q(".f-sens-l", "areaSensitivity");
    this._q(".f-inherit-l").textContent = t("areaSensInherit", { n: getSettings().sensitivity });
    const sh = /** @type {HTMLSelectElement} */ (this._q("#ae-shape"));
    sh.options[0].textContent = t("shapeRect");
    sh.options[1].textContent = t("shapeEllipse");
    sh.options[2].textContent = t("shapePolygon");
    this._q(".toolbar").setAttribute("aria-label", t("areaToolbar"));
    this._q(".list").setAttribute("aria-label", t("areaList"));
    this._stage().setAttribute("aria-label", t("a11yAreaStage"));
  }

  _shapeName(shape) {
    return t(shape === "polygon" ? "shapePolygon" : shape === "ellipse" ? "shapeEllipse" : "shapeRect");
  }

  _pos(e) {
    const b = this._stage().getBoundingClientRect();
    return {
      x: clamp((e.clientX - b.left) / b.width, 0, 1),
      y: clamp((e.clientY - b.top) / b.height, 0, 1),
    };
  }

  _nextName() {
    const base = t("areaDefaultName");
    for (let n = 1; ; n++) {
      const name = `${base} ${n}`;
      if (!this._areas.some((a) => a.name === name)) return name;
    }
  }

  _add(shape) {
    if (this._areas.length >= MAX_AREAS) return;
    const off = (this._areas.length % 5) * 0.04;
    const area = { id: newId(), name: this._nextName(), shape, enabled: true };
    if (shape === "polygon") {
      area.points = [[0.3 + off, 0.3 + off], [0.7 + off, 0.3 + off], [0.75 + off, 0.7 + off], [0.25 + off, 0.7 + off]]
        .map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)]);
    } else {
      Object.assign(area, { x: 0.3 + off, y: 0.3 + off, w: 0.4, h: 0.4 });
    }
    this._areas.push(area);
    this._select(area.id, true);
  }

  _select(id, focusName = false) {
    this._sel = id;
    this._render();
    if (focusName) /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(`li[data-id="${id}"] .name`))?.focus();
  }

  _remove(id) {
    const i = this._index(id);
    if (i < 0) return;
    this._areas.splice(i, 1);
    if (this._sel === id) this._sel = this._areas[Math.min(i, this._areas.length - 1)]?.id ?? null;
    this._render();
  }

  // ---- event wiring -------------------------------------------------------

  _bind() {
    this._q(".add-rect").addEventListener("click", () => this._add("rect"));
    this._q(".add-ellipse").addEventListener("click", () => this._add("ellipse"));
    this._q(".add-polygon").addEventListener("click", () => this._add("polygon"));
    this._q(".add-point").addEventListener("click", () => {
      const a = this._area();
      if (a) { addPoint(a); this._render(); }
    });

    const shapeSel = /** @type {HTMLSelectElement} */ (this._q("#ae-shape"));
    shapeSel.addEventListener("change", () => {
      const a = this._area();
      if (a) { convertShape(a, shapeSel.value); this._render(); shapeSel.focus(); }
    });
    for (const k of ["x", "y", "w", "h"]) {
      const input = /** @type {HTMLInputElement} */ (this._q(`#ae-${k}`));
      input.addEventListener("input", () => {
        const a = this._area();
        const v = Number(input.value);
        if (!a || input.value === "" || !Number.isFinite(v)) return;
        const b = bbox(a);
        b[k] = v / 100;
        this._applyBBox(a, b, k);
        this._renderStage();
      });
      input.addEventListener("change", () => this._render());
    }

    const sens = /** @type {HTMLInputElement} */ (this._q("#ae-sens"));
    const inherit = /** @type {HTMLInputElement} */ (this._q("#ae-inherit"));
    sens.addEventListener("input", () => {
      const a = this._area();
      if (!a) return;
      a.sensitivity = Number(sens.value);
      inherit.checked = false;
      this._syncSens();
      this._updateTags();
    });
    inherit.addEventListener("change", () => {
      const a = this._area();
      if (!a) return;
      a.sensitivity = inherit.checked ? null : Number(sens.value);
      this._syncSens();
      this._updateTags();
    });

    const stage = this._stage();
    stage.addEventListener("pointerdown", (e) => this._down(e));
    stage.addEventListener("pointermove", (e) => this._move(e));
    stage.addEventListener("pointerup", (e) => this._up(e));
    stage.addEventListener("pointercancel", (e) => this._up(e));
  }

  /** Clamp a bounding box into the frame / to the minimum size and apply it. */
  _applyBBox(a, b, changed) {
    b.w = clamp(b.w, MIN_SIZE, 1);
    b.h = clamp(b.h, MIN_SIZE, 1);
    b.x = clamp(b.x, 0, 1 - b.w);
    b.y = clamp(b.y, 0, 1 - b.h);
    setBBox(a, b);
  }

  _down(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const stage = this._stage();
    const target = /** @type {Element} */ (e.target);
    const handle = target.closest?.(".handle");
    const shapeEl = target.closest?.("[data-id]");
    const p = this._pos(e);

    if (handle) {
      const a = this._area();
      if (!a) return;
      const kind = handle.getAttribute("data-kind");
      this._drag = { mode: kind, orig: cloneArea(a), start: p, h: handle.getAttribute("data-h"), i: Number(handle.getAttribute("data-i")) };
      if (kind === "mid") {
        // insert a new vertex on this edge and drag it
        const i = this._drag.i + 1;
        a.points.splice(i, 0, [p.x, p.y]);
        this._drag = { mode: "vertex", orig: cloneArea(a), start: p, i };
        this._render();
      }
    } else if (shapeEl && shapeEl.getAttribute("data-id")) {
      const id = shapeEl.getAttribute("data-id");
      if (this._sel !== id) { this._sel = id; this._render(); }
      this._drag = { mode: "move", orig: cloneArea(this._area()), start: p };
    } else {
      this._drag = { mode: "draw", start: p, id: null };
    }
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  _move(e) {
    const d = this._drag;
    if (!d) return;
    const p = this._pos(e);
    if (d.mode === "draw") {
      const w = Math.abs(p.x - d.start.x), h = Math.abs(p.y - d.start.y);
      if (!d.id) {
        if (w < 0.02 && h < 0.02) return; // treat as a click
        if (this._areas.length >= MAX_AREAS) { this._drag = null; return; }
        const area = { id: newId(), name: this._nextName(), shape: "rect", enabled: true, x: 0, y: 0, w: MIN_SIZE, h: MIN_SIZE };
        this._areas.push(area);
        d.id = area.id;
        this._sel = area.id;
        this._render();
      }
      const a = this._area(d.id);
      a.x = Math.min(d.start.x, p.x);
      a.y = Math.min(d.start.y, p.y);
      a.w = Math.max(MIN_SIZE, w);
      a.h = Math.max(MIN_SIZE, h);
      this._applyBBox(a, bbox(a));
    } else {
      const a = this._area();
      if (!a) return;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (d.mode === "move") {
        Object.assign(a, cloneArea(d.orig));
        moveArea(a, dx, dy);
      } else if (d.mode === "resize") {
        const b = this._resized(bbox(d.orig), d.h, dx, dy);
        Object.assign(a, cloneArea(d.orig));
        this._applyBBox(a, b);
      } else if (d.mode === "vertex") {
        a.points[d.i] = [p.x, p.y];
      }
    }
    this._renderStage();
    this._syncFields();
  }

  _up(e) {
    if (!this._drag) return;
    const d = this._drag;
    this._drag = null;
    try { this._stage().releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (d.mode === "draw" && !d.id) {
      // plain click on empty space: deselect
      this._sel = null;
    }
    this._render();
  }

  _resized(b, dir, dx, dy) {
    let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    if (dir.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN_SIZE);
    if (dir.includes("e")) x1 = clamp(x1 + dx, x0 + MIN_SIZE, 1);
    if (dir.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN_SIZE);
    if (dir.includes("s")) y1 = clamp(y1 + dy, y0 + MIN_SIZE, 1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Arrow keys on a focused handle nudge it; Delete removes a polygon point. */
  _handleKey(e, handle) {
    const a = this._area();
    if (!a) return;
    const step = (e.shiftKey ? 0.05 : 0.01);
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const kind = handle.dataset.kind;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (kind === "vertex" && a.points.length > 3) {
        e.preventDefault();
        a.points.splice(Number(handle.dataset.i), 1);
        this._render();
        this._focusHandle("move");
      }
      return;
    }
    const mv = arrows[e.key];
    if (!mv) return;
    e.preventDefault();
    const dx = mv[0] * step, dy = mv[1] * step;
    if (kind === "move") moveArea(a, dx, dy);
    else if (kind === "resize") {
      const nb = this._resized(bbox(a), handle.dataset.h, dx, dy);
      this._applyBBox(a, nb);
    } else if (kind === "vertex") {
      const i = Number(handle.dataset.i);
      a.points[i] = [clamp(a.points[i][0] + dx, 0, 1), clamp(a.points[i][1] + dy, 0, 1)];
    } else if (kind === "mid") {
      const i = Number(handle.dataset.i) + 1;
      const p = a.points[i - 1], q = a.points[i % a.points.length];
      a.points.splice(i, 0, [(p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2 + dy]);
      this._render();
      this._focusHandle("vertex", i);
      return;
    }
    this._renderStage();
    this._syncFields();
    this._focusHandle(kind, handle.dataset.h || handle.dataset.i);
  }

  _focusHandle(kind, key) {
    const sel = key == null
      ? `.handle[data-kind="${kind}"]`
      : `.handle[data-kind="${kind}"][data-h="${key}"], .handle[data-kind="${kind}"][data-i="${key}"]`;
    /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(sel))?.focus();
  }

  // ---- rendering ----------------------------------------------------------

  _render() {
    this._renderList();
    this._renderDetail();
    this._renderStage();
    this._q(".empty").hidden = this._areas.length > 0;
    this._q(".empty").textContent = t("noAreasHint");
    const full = this._areas.length >= MAX_AREAS;
    for (const s of [".add-rect", ".add-ellipse", ".add-polygon"]) /** @type {HTMLButtonElement} */ (this._q(s)).disabled = full;
  }

  _renderList() {
    const ul = this._q(".list");
    // keep focus on a name input while typing: only rebuild when the set of rows changed
    const ids = this._areas.map((a) => a.id).join();
    if (ul.dataset.ids !== ids) {
      ul.dataset.ids = ids;
      ul.innerHTML = "";
      this._areas.forEach((a, i) => {
        const li = document.createElement("li");
        li.className = "row";
        li.dataset.id = a.id;
        li.innerHTML = `
          <span class="swatch" aria-hidden="true"></span>
          <input class="name" type="text" maxlength="40">
          <span class="shape-tag"></span>
          <label class="active-label"><input type="checkbox" class="switch enabled"><span class="active-text"></span></label>
          <button type="button" class="btn btn-danger btn-sm del"></button>`;
        li.querySelector(".swatch").style.background = colorFor(i);
        const name = /** @type {HTMLInputElement} */ (li.querySelector(".name"));
        name.value = a.name;
        name.addEventListener("focus", () => { if (this._sel !== a.id) { this._sel = a.id; this._renderStage(); this._renderDetail(); this._markSelected(); } });
        name.addEventListener("input", () => { a.name = name.value; this._updateLabels(); });
        name.addEventListener("blur", () => { a.name = name.value.trim() || `${t("areaDefaultName")} ${i + 1}`; name.value = a.name; this._updateLabels(); });
        const en = /** @type {HTMLInputElement} */ (li.querySelector(".enabled"));
        en.checked = a.enabled;
        en.addEventListener("change", () => { a.enabled = en.checked; this._sel = a.id; this._render(); });
        li.querySelector(".del").addEventListener("click", () => this._remove(a.id));
        li.addEventListener("click", (e) => {
          if (/** @type {Element} */ (e.target).closest("button, input")) return;
          this._select(a.id);
        });
        ul.appendChild(li);
      });
    }
    this._areas.forEach((a) => {
      const li = /** @type {HTMLElement | null} */ (ul.querySelector(`li[data-id="${a.id}"]`));
      if (!li) return;
      li.querySelector(".shape-tag").textContent = this._tagText(a);
      li.querySelector(".active-text").textContent = t("areaActive");
      const name = /** @type {HTMLInputElement} */ (li.querySelector(".name"));
      name.setAttribute("aria-label", t("areaName"));
      const del = li.querySelector(".del");
      del.textContent = t("deleteArea");
      del.setAttribute("aria-label", `${t("deleteArea")}: ${a.name}`);
      /** @type {HTMLInputElement} */ (li.querySelector(".enabled")).checked = a.enabled;
      li.dataset.selected = String(a.id === this._sel);
    });
  }

  _markSelected() {
    this.shadowRoot.querySelectorAll("li.row").forEach((li) => {
      /** @type {HTMLElement} */ (li).dataset.selected = String(/** @type {HTMLElement} */ (li).dataset.id === this._sel);
    });
  }

  _renderDetail() {
    const a = this._area();
    const fs = /** @type {HTMLElement} */ (this._q(".detail"));
    fs.hidden = !a;
    if (!a) return;
    this._q(".detail legend").textContent = `${t("areaSelected")}: ${a.name}`;
    /** @type {HTMLSelectElement} */ (this._q("#ae-shape")).value = a.shape;
    this._q(".poly-actions").hidden = a.shape !== "polygon";
    this._syncSens();
    /** @type {HTMLButtonElement} */ (this._q(".add-point")).disabled = a.shape === "polygon" && a.points.length >= MAX_POINTS;
    this._syncFields();
  }

  /** Sensitivity controls of the selected area: own value, or the global one when inherited. */
  _syncSens() {
    const a = this._area();
    if (!a) return;
    const global = getSettings().sensitivity;
    const sens = /** @type {HTMLInputElement} */ (this._q("#ae-sens"));
    const inherit = /** @type {HTMLInputElement} */ (this._q("#ae-inherit"));
    const own = a.sensitivity != null;
    inherit.checked = !own;
    sens.disabled = !own;
    sens.value = String(own ? a.sensitivity : global);
    syncRange(sens);
    this._q(".sens-out").textContent = String(sens.value);
    this._q(".f-inherit-l").textContent = t("areaSensInherit", { n: global });
  }

  _updateTags() {
    this._areas.forEach((a) => {
      const tag = this.shadowRoot.querySelector(`li[data-id="${a.id}"] .shape-tag`);
      if (tag) tag.textContent = this._tagText(a);
    });
    this._updateLabels();
  }

  _tagText(a) {
    return a.sensitivity != null ? `${this._shapeName(a.shape)} · ${a.sensitivity}` : this._shapeName(a.shape);
  }

  _syncFields() {
    const a = this._area();
    if (!a) return;
    const b = bbox(a);
    for (const k of ["x", "y", "w", "h"]) {
      const input = /** @type {HTMLInputElement} */ (this._q(`#ae-${k}`));
      if (this.shadowRoot.activeElement !== input) input.value = String(Math.round(b[k] * 100));
    }
  }

  /** Refresh the area name labels without touching the handles (keeps keyboard focus intact). */
  _updateLabels() {
    const labels = this.shadowRoot.querySelectorAll(".stage .label");
    this._areas.forEach((a, i) => { if (labels[i]) labels[i].textContent = a.sensitivity != null ? `${a.name} · ${a.sensitivity}` : a.name; });
  }

  _renderStage() {
    const stage = this._stage();
    // remember a focused handle so the rebuild below does not drop keyboard focus
    const act = /** @type {HTMLElement | null} */ (this.shadowRoot.activeElement);
    const focused = act?.classList.contains("handle") ? { kind: act.dataset.kind, h: act.dataset.h, i: act.dataset.i } : null;
    stage.querySelectorAll("svg, .handle, .label").forEach((n) => n.remove());

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    this._areas.forEach((a, i) => {
      const el = shapeElement(a);
      const color = a.enabled ? colorFor(i) : "#9ca3af";
      el.setAttribute("class", "shape");
      el.setAttribute("data-id", a.id);
      el.setAttribute("fill", color);
      el.setAttribute("fill-opacity", a.id === this._sel ? "0.3" : "0.15");
      el.setAttribute("stroke", a.id === this._sel ? "#fff" : color);
      el.setAttribute("stroke-width", a.id === this._sel ? "3" : "2");
      el.setAttribute("stroke-dasharray", a.enabled ? "" : "5 4");
      el.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(el);
    });
    stage.appendChild(svg);

    this._areas.forEach((a, i) => {
      const b = bbox(a);
      const lab = document.createElement("span");
      lab.className = "label";
      lab.textContent = a.sensitivity != null ? `${a.name} · ${a.sensitivity}` : a.name;
      lab.style.left = `${b.x * 100}%`;
      lab.style.top = `${b.y * 100}%`;
      lab.style.background = a.enabled ? colorFor(i) : "#9ca3af";
      stage.appendChild(lab);
    });

    const a = this._area();
    if (!a) return;
    const mk = (kind, x, y, label, extra = {}) => {
      const h = document.createElement("button");
      h.type = "button";
      h.className = `handle ${kind === "resize" ? "" : kind}`;
      h.dataset.kind = kind;
      h.style.left = `${x * 100}%`;
      h.style.top = `${y * 100}%`;
      h.setAttribute("aria-label", label);
      for (const [k, v] of Object.entries(extra)) h.dataset[k] = String(v);
      h.addEventListener("keydown", (e) => this._handleKey(e, h));
      if (kind === "vertex") h.addEventListener("dblclick", () => {
        if (a.points.length > 3) { a.points.splice(Number(h.dataset.i), 1); this._render(); }
      });
      stage.appendChild(h);
      return h;
    };
    const b = bbox(a);
    const mv = mk("move", b.x + b.w / 2, b.y + b.h / 2, `${t("handleMove")}: ${a.name}`);
    mv.textContent = "✥";
    if (a.shape === "polygon") {
      a.points.forEach((p, i) => {
        const q = a.points[(i + 1) % a.points.length];
        if (a.points.length < MAX_POINTS) mk("mid", (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, t("handleAddPoint"), { i });
      });
      a.points.forEach((p, i) => mk("vertex", p[0], p[1], t("handlePoint", { n: i + 1 }), { i }));
    } else {
      for (const d of DIRS) {
        const [fx, fy] = DIR_POS[d];
        mk("resize", b.x + b.w * fx, b.y + b.h * fy, `${t("handleResize")}: ${t(DIR_KEY[d])}`, { h: d });
      }
    }
    if (focused) {
      const sel = `.handle[data-kind="${focused.kind}"]` + (focused.h ? `[data-h="${focused.h}"]` : "") + (focused.i != null ? `[data-i="${focused.i}"]` : "");
      /** @type {HTMLElement | null} */ (this.shadowRoot.querySelector(sel))?.focus({ preventScroll: true });
    }
  }
}

customElements.define("area-editor", AreaEditor);
