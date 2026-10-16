import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAreas, bbox, setBBox, moveArea, convertShape, addPoint, cloneArea, MIN_SIZE, MAX_AREAS, MAX_POINTS,
} from "../../src/services/areas.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("normalizeAreas drops unusable entries and clamps the rest", () => {
  const out = normalizeAreas([
    { name: "ok", shape: "rect", x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
    { name: "outside", shape: "rect", x: 2, y: -1, w: 5, h: 0 },
    { name: "nan", shape: "rect", x: "a", y: 0, w: 1, h: 1 },
    { name: "poly2", shape: "polygon", points: [[0, 0], [1, 1]] },
    { name: "flat", shape: "polygon", points: [[0.1, 0.1], [0.5, 0.1], [0.9, 0.1]] },
    { name: "tri", shape: "polygon", points: [[0.5, 0.1], [0.9, 0.9], [0.1, 0.9]] },
    null,
    42,
  ]);
  assert.deepEqual(out.map((a) => a.name), ["ok", "outside", "tri"]);
  const outside = out[1];
  assert.ok(outside.x <= 1 - MIN_SIZE && outside.y >= 0 && outside.w >= MIN_SIZE && outside.h >= MIN_SIZE);
  assert.ok(outside.x + outside.w <= 1 && outside.y + outside.h <= 1);
});

test("normalizeAreas gives names, ids, enabled and caps the count", () => {
  const out = normalizeAreas(Array.from({ length: 40 }, () => ({ shape: "ellipse", x: 0.1, y: 0.1, w: 0.2, h: 0.2 })));
  assert.equal(out.length, MAX_AREAS);
  assert.equal(new Set(out.map((a) => a.id)).size, MAX_AREAS);
  assert.ok(out.every((a) => a.name && a.enabled === true));
  assert.deepEqual(normalizeAreas(undefined), []);
});

test("unknown shapes fall back to rect", () => {
  const [a] = normalizeAreas([{ shape: "star", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]);
  assert.equal(a.shape, "rect");
});

test("moveArea keeps the shape inside the frame", () => {
  const a = { shape: "rect", x: 0.5, y: 0.5, w: 0.3, h: 0.3 };
  moveArea(a, 5, -5);
  near(a.x, 0.7);
  near(a.y, 0);
  const p = { shape: "polygon", points: [[0.4, 0.4], [0.6, 0.4], [0.5, 0.6]] };
  moveArea(p, -5, 5);
  const b = bbox(p);
  near(b.x, 0);
  near(b.y + b.h, 1);
});

test("setBBox scales polygons into the new box", () => {
  const p = { shape: "polygon", points: [[0.2, 0.2], [0.4, 0.2], [0.3, 0.4]] };
  setBBox(p, { x: 0.5, y: 0.5, w: 0.4, h: 0.4 });
  const b = bbox(p);
  near(b.x, 0.5); near(b.y, 0.5); near(b.w, 0.4); near(b.h, 0.4);
});

test("convertShape keeps the area where it is", () => {
  const rect = { id: "a", name: "r", shape: "rect", enabled: true, x: 0.2, y: 0.3, w: 0.4, h: 0.2 };
  const poly = convertShape(cloneArea(rect), "polygon");
  assert.equal(poly.shape, "polygon");
  assert.equal(poly.points.length, 4);
  assert.deepEqual(Object.keys(poly).filter((k) => ["x", "y", "w", "h"].includes(k)), []);
  const back = convertShape(cloneArea(poly), "rect");
  near(back.x, 0.2); near(back.y, 0.3); near(back.w, 0.4); near(back.h, 0.2);

  const ell = convertShape(cloneArea(rect), "ellipse");
  assert.equal(ell.shape, "ellipse");
  const ellPoly = convertShape(cloneArea(ell), "polygon");
  assert.ok(ellPoly.points.length >= 8);
  const eb = bbox(ellPoly);
  near(eb.x, 0.2, 1e-6); near(eb.w, 0.4, 1e-6);
});

test("addPoint splits the longest edge and respects the cap", () => {
  const p = { shape: "polygon", points: [[0, 0], [1, 0], [0.9, 0.05]] };
  addPoint(p);
  assert.equal(p.points.length, 4);
  assert.deepEqual(p.points[1], [0.5, 0], "midpoint of the longest edge (0,0)->(1,0)");
  const big = { shape: "polygon", points: Array.from({ length: MAX_POINTS }, (_, i) => [i / MAX_POINTS, (i % 2) / 2]) };
  addPoint(big);
  assert.equal(big.points.length, MAX_POINTS);
});

test("per-area sensitivity: null by default, rounded and clamped, junk becomes null", () => {
  const out = normalizeAreas([
    { name: "a", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    { name: "b", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, sensitivity: 72.6 },
    { name: "c", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, sensitivity: 400 },
    { name: "d", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, sensitivity: -5 },
    { name: "e", shape: "polygon", points: [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]], sensitivity: "high" },
    { name: "f", shape: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, sensitivity: 0 },
  ]);
  assert.deepEqual(out.map((a) => a.sensitivity), [null, 73, 100, 0, null, 0]);
  const poly = convertShape(cloneArea({ ...out[1] }), "polygon");
  assert.equal(poly.sensitivity, 73, "kept when the shape changes");
});
