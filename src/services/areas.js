/**
 * Detection areas: named shapes (rectangle, ellipse, polygon) in normalised
 * frame coordinates (0-1, origin top-left). Detection looks at the union of
 * all enabled areas; no areas = whole frame.
 *
 * @typedef {{ id: string; name: string; shape: 'rect'|'ellipse'|'polygon'; enabled: boolean;
 *   sensitivity: number | null; // 0-100, null = use the global sensitivity
 *   x?: number; y?: number; w?: number; h?: number; points?: [number, number][] }} Area
 */

export const SHAPES = ["rect", "ellipse", "polygon"];
export const MIN_SIZE = 0.04;
export const MAX_AREAS = 12;
export const MAX_POINTS = 24;

const COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#f472b6", "#fb7185"];
export const colorFor = (i) => COLORS[i % COLORS.length];

export const newId = () => "a" + Math.random().toString(36).slice(2, 8);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** Validate stored/user data; drops unusable entries. */
export function normalizeAreas(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_AREAS)) {
    if (!raw || typeof raw !== "object") continue;
    const shape = SHAPES.includes(raw.shape) ? raw.shape : "rect";
    let id = typeof raw.id === "string" && raw.id && !seen.has(raw.id) ? raw.id : newId();
    seen.add(id);
    const name = (typeof raw.name === "string" ? raw.name.trim() : "").slice(0, 40) || `Area ${out.length + 1}`;
    const sens = num(raw.sensitivity);
    const area = { id, name, shape, enabled: raw.enabled !== false, sensitivity: Number.isNaN(sens) ? null : clamp(Math.round(sens), 0, 100) };
    if (shape === "polygon") {
      if (!Array.isArray(raw.points) || raw.points.length < 3) continue;
      const pts = raw.points.slice(0, MAX_POINTS).map((p) => [clamp(num(p?.[0]), 0, 1), clamp(num(p?.[1]), 0, 1)]);
      if (pts.some((p) => Number.isNaN(p[0]) || Number.isNaN(p[1]))) continue;
      area.points = pts;
      const b = bbox(area);
      if (b.w < MIN_SIZE || b.h < MIN_SIZE) continue;
    } else {
      let x = num(raw.x), y = num(raw.y), w = num(raw.w), h = num(raw.h);
      if ([x, y, w, h].some(Number.isNaN)) continue;
      x = clamp(x, 0, 1 - MIN_SIZE);
      y = clamp(y, 0, 1 - MIN_SIZE);
      area.x = x;
      area.y = y;
      area.w = clamp(w, MIN_SIZE, 1 - x);
      area.h = clamp(h, MIN_SIZE, 1 - y);
    }
    out.push(area);
  }
  return out;
}

export const cloneArea = (a) => JSON.parse(JSON.stringify(a));

/** @returns {{x:number,y:number,w:number,h:number}} */
export function bbox(a) {
  if (a.shape !== "polygon") return { x: a.x, y: a.y, w: a.w, h: a.h };
  const xs = a.points.map((p) => p[0]);
  const ys = a.points.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Fit the area into a new bounding box (polygons are scaled/translated). */
export function setBBox(a, nb) {
  if (a.shape !== "polygon") {
    Object.assign(a, nb);
    return a;
  }
  const ob = bbox(a);
  a.points = a.points.map(([px, py]) => [
    nb.x + (ob.w ? ((px - ob.x) / ob.w) * nb.w : nb.w / 2),
    nb.y + (ob.h ? ((py - ob.y) / ob.h) * nb.h : nb.h / 2),
  ]);
  return a;
}

/** Move without leaving the frame. */
export function moveArea(a, dx, dy) {
  const b = bbox(a);
  dx = clamp(dx, -b.x, 1 - b.x - b.w);
  dy = clamp(dy, -b.y, 1 - b.y - b.h);
  if (a.shape === "polygon") a.points = a.points.map(([px, py]) => [px + dx, py + dy]);
  else {
    a.x += dx;
    a.y += dy;
  }
  return a;
}

export function ellipsePoints(a, n = 16) {
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + (Math.cos(t) * a.w) / 2, cy + (Math.sin(t) * a.h) / 2];
  });
}

/** Change an area's shape, keeping it where it is. */
export function convertShape(a, shape) {
  if (a.shape === shape) return a;
  const b = bbox(a);
  if (shape === "polygon") {
    a.points = a.shape === "ellipse"
      ? ellipsePoints(a)
      : [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    delete a.x; delete a.y; delete a.w; delete a.h;
  } else if (a.shape === "polygon") {
    Object.assign(a, b);
    delete a.points;
  }
  a.shape = shape;
  return a;
}

/** Add a vertex in the middle of the longest edge. */
export function addPoint(a) {
  if (a.shape !== "polygon" || a.points.length >= MAX_POINTS) return a;
  let best = 0, bestLen = -1;
  a.points.forEach((p, i) => {
    const q = a.points[(i + 1) % a.points.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len > bestLen) { bestLen = len; best = i; }
  });
  const p = a.points[best], q = a.points[(best + 1) % a.points.length];
  a.points.splice(best + 1, 0, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
  return a;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG element for an area in a 0-100 viewBox. */
export function shapeElement(a) {
  const k = (v) => v * 100;
  let el;
  if (a.shape === "polygon") {
    el = document.createElementNS(SVG_NS, "polygon");
    el.setAttribute("points", a.points.map((p) => `${k(p[0])},${k(p[1])}`).join(" "));
  } else if (a.shape === "ellipse") {
    el = document.createElementNS(SVG_NS, "ellipse");
    el.setAttribute("cx", String(k(a.x + a.w / 2)));
    el.setAttribute("cy", String(k(a.y + a.h / 2)));
    el.setAttribute("rx", String(k(a.w / 2)));
    el.setAttribute("ry", String(k(a.h / 2)));
  } else {
    el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("x", String(k(a.x)));
    el.setAttribute("y", String(k(a.y)));
    el.setAttribute("width", String(k(a.w)));
    el.setAttribute("height", String(k(a.h)));
  }
  return el;
}

/**
 * Overlay for the live view: dims everything outside the enabled areas and
 * outlines each one. Returns the <svg>.
 */
export function overlaySvg(areas, maskId = "areas-hole") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  const active = areas.filter((a) => a.enabled);
  const defs = document.createElementNS(SVG_NS, "defs");
  const mask = document.createElementNS(SVG_NS, "mask");
  mask.setAttribute("id", maskId);
  const white = document.createElementNS(SVG_NS, "rect");
  white.setAttribute("width", "100");
  white.setAttribute("height", "100");
  white.setAttribute("fill", "#fff");
  mask.appendChild(white);
  for (const a of active) {
    const h = shapeElement(a);
    h.setAttribute("fill", "#000");
    mask.appendChild(h);
  }
  defs.appendChild(mask);
  svg.appendChild(defs);
  const dim = document.createElementNS(SVG_NS, "rect");
  dim.setAttribute("width", "100");
  dim.setAttribute("height", "100");
  dim.setAttribute("fill", "rgba(0,0,0,0.4)");
  dim.setAttribute("mask", `url(#${maskId})`);
  svg.appendChild(dim);
  areas.forEach((a, i) => {
    const o = shapeElement(a);
    o.setAttribute("fill", "none");
    o.setAttribute("stroke", a.enabled ? colorFor(i) : "#9ca3af");
    o.setAttribute("stroke-width", "2");
    o.setAttribute("stroke-dasharray", a.enabled ? "" : "4 3");
    o.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(o);
  });
  return svg;
}
