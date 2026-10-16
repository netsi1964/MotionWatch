import { test, expect, open, ev } from "./helpers.mjs";

/**
 * Synthetic scene: a noisy static picture, optionally with a small block moving across it.
 * Runs the real MotionDetector (GPU path and CPU fallback) against a live <video>.
 */
async function runScene(page, { gpu, sensitivity, phase, areas = [] }) {
  return ev(page, `(async () => {
    const { MotionDetector } = await import('./src/services/motion.js');
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const x = cv.getContext('2d');
    let moving = ${phase === "move"}; const t0 = performance.now();
    let stop = false;
    const paint = () => {
      x.fillStyle = '#303030'; x.fillRect(0, 0, 640, 360);
      for (let i = 0; i < 400; i++) { const g = 48 + ((Math.random() * 9) | 0) - 4; x.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; x.fillRect((Math.random() * 640) | 0, (Math.random() * 360) | 0, 6, 6); }
      if (moving) { const u = ((performance.now() - t0) / 1000 * 120) % 400; x.fillStyle = '#e0e0e0'; x.fillRect(40 + (u < 200 ? u : 400 - u), 120, 70, 70); } // pendulum inside the left half (x 40..310)
      if (!stop) requestAnimationFrame(paint);
    };
    paint();
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = cv.captureStream(30); await v.play();
    const d = new MotionDetector({ preferGpu: ${gpu}, sensitivity: ${sensitivity} });
    d.setAreas(${JSON.stringify(areas)});
    d.reset(); let hits = 0, n = 0, changed = 0; const hot = new Set();
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 60));
      const s = d.analyze(v);
      if (i > 3) { n++; changed += d.lastChanged; if (d.isMotion(s)) hits++; d.hot.forEach((id) => hot.add(id)); }
    }
    stop = true; v.srcObject.getTracks().forEach((t) => t.stop());
    return { backend: d.backend, hitRate: hits / n, changed: changed / n, hot: [...hot] };
  })()`);
}

for (const gpu of [true, false]) {
  test.describe(`${gpu ? "GPU (WebGL)" : "CPU fallback"} detector`, () => {
    test("sensor noise does not trigger", async ({ page }) => {
      await open(page);
      const r = await runScene(page, { gpu, sensitivity: 40, phase: "static" });
      expect(r.backend).toBe(gpu ? "gpu" : "cpu");
      expect(r.hitRate).toBe(0);
      expect(r.changed).toBeLessThan(0.002);
    });

    test("a small moving block triggers at the default sensitivity", async ({ page }) => {
      await open(page);
      const r = await runScene(page, { gpu, sensitivity: 40, phase: "move" });
      expect(r.hitRate).toBeGreaterThan(0.5);   // ~1 in 2 samples or better even on a loaded machine; noise gives 0
      expect(r.changed).toBeGreaterThan(0.004);
    });

    test("sensitivity 0 is deaf to the same block, 100 hears it", async ({ page }) => {
      await open(page);
      expect((await runScene(page, { gpu, sensitivity: 0, phase: "move" })).hitRate).toBe(0);
      expect((await runScene(page, { gpu, sensitivity: 100, phase: "move" })).hitRate).toBeGreaterThan(0.8);
    });
  });
}

test("GPU and CPU agree on the same live frames", async ({ page }) => {
  await open(page);
  const r = await ev(page, `(async () => {
    const { MotionDetector } = await import('./src/services/motion.js');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
    const g = new MotionDetector({ minIntervalMs: 0 }), c = new MotionDetector({ preferGpu: false, minIntervalMs: 0 });
    let err = 0, n = 0, mean = 0;
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); g.analyze(v); c.analyze(v); if (i > 3) { err += Math.abs(g.lastChanged - c.lastChanged); mean += c.lastChanged; n++; } }
    stream.getTracks().forEach((t) => t.stop());
    return { gpu: g.backend, meanCpu: mean / n, meanAbsErr: err / n };
  })()`);
  expect(r.gpu).toBe("gpu");
  expect(r.meanAbsErr).toBeLessThan(0.03);   // within 3 percentage points of changed area
});

test("the detector throttles to ~120 ms between comparisons", async ({ page }) => {
  await open(page);
  const calls = await ev(page, `(async () => {
    const { MotionDetector } = await import('./src/services/motion.js');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
    const d = new MotionDetector({ preferGpu: false });
    let runs = 0; const orig = d._cpuAvgDiff.bind(d); d._cpuAvgDiff = (...a) => { runs++; return orig(...a); };
    const start = performance.now(); while (performance.now() - start < 1000) { d.analyze(v); await new Promise((r) => requestAnimationFrame(r)); }
    stream.getTracks().forEach((t) => t.stop());
    return runs;
  })()`);
  expect(calls).toBeGreaterThan(4);
  expect(calls).toBeLessThanOrEqual(9);
});

test("canvas preview paints the picture when forced (Safari workaround)", async ({ page }) => {
  await open(page, "preview=canvas");
  await ev(page, `${"document.querySelector('motion-app').shadowRoot.querySelector('camera-monitor')"}.startMonitoring()`);
  const info = await expect.poll(async () => ev(page, `(() => {
    const cs = document.querySelector('motion-app').shadowRoot.querySelector('camera-monitor').shadowRoot;
    const c = cs.querySelector('.preview-canvas'), v = cs.querySelector('video');
    if (c.hidden || !c.width) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lit = 0;
    for (let i = 0; i < d.length; i += 40) if (d[i] || d[i + 1] || d[i + 2]) lit++;
    return lit > 100 && v.style.opacity === '0';
  })()`)).toBe(true);
});

// The moving block pendulums inside the LEFT half, so only the left area ever sees it.
const L = (extra = {}) => ({ id: "L", name: "Left", shape: "rect", enabled: true, x: 0, y: 0, w: 0.5, h: 1, sensitivity: null, ...extra });
const R = (extra = {}) => ({ id: "R", name: "Right", shape: "rect", enabled: true, x: 0.5, y: 0, w: 0.5, h: 1, sensitivity: null, ...extra });

for (const gpu of [true, false]) {
  test.describe(`per-area sensitivity (${gpu ? "GPU" : "CPU"})`, () => {
    test("an area without its own value follows the global sensitivity", async ({ page }) => {
      await open(page);
      expect((await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L()] })).hitRate).toBeGreaterThan(0.6);
      expect((await runScene(page, { gpu, sensitivity: 0, phase: "move", areas: [L()] })).hitRate).toBe(0);
    });

    test("an area's own sensitivity wins over the global one, both ways", async ({ page }) => {
      await open(page);
      expect((await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L({ sensitivity: 0 })] })).hitRate, "global 40, area 0").toBe(0);
      expect((await runScene(page, { gpu, sensitivity: 0, phase: "move", areas: [L({ sensitivity: 100 })] })).hitRate, "global 0, area 100").toBeGreaterThan(0.8);
      expect((await runScene(page, { gpu, sensitivity: 100, phase: "move", areas: [L({ sensitivity: 0 })] })).hitRate, "global 100, area 0").toBe(0);
    });

    test("areas are judged separately: motion in a deaf area does not trigger, a sensitive one does", async ({ page }) => {
      await open(page);
      const deafLeft = await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L({ sensitivity: 0 }), R({ sensitivity: 100 })] });
      expect(deafLeft.hitRate).toBe(0);
      expect(deafLeft.hot).toEqual([]);
      const hearingLeft = await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L({ sensitivity: 100 }), R({ sensitivity: 0 })] });
      expect(hearingLeft.hitRate).toBeGreaterThan(0.8);
      expect(hearingLeft.hot).toEqual(["L"]);
    });

    test("a quiet area does not dilute a busy one (each area uses its own pixel count)", async ({ page }) => {
      await open(page);
      const r = await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L(), R()] });
      expect(r.hitRate).toBeGreaterThan(0.8);
      expect(r.hot).toEqual(["L"]);
    });

    test("overlapping areas keep their own sensitivity", async ({ page }) => {
      await open(page);
      const whole = (id, sensitivity) => ({ id, name: id, shape: "rect", enabled: true, x: 0, y: 0, w: 1, h: 1, sensitivity });
      const r = await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [whole("deaf", 0), whole("keen", 100)] });
      expect(r.hitRate).toBeGreaterThan(0.8);
      expect(r.hot).toEqual(["keen"]);
    });

    test("disabled areas are ignored", async ({ page }) => {
      await open(page);
      const r = await runScene(page, { gpu, sensitivity: 40, phase: "move", areas: [L({ enabled: false }), R({ sensitivity: 100 })] });
      expect(r.hitRate, "only the (quiet) right area is active").toBe(0);
    });
  });
}

test("GPU and CPU agree per area on live frames (three overlapping areas)", async ({ page }) => {
  await open(page);
  const r = await ev(page, `(async () => {
    const { MotionDetector } = await import('./src/services/motion.js');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
    const areas = [
      { id: 'a', name: 'a', shape: 'rect', enabled: true, x: 0, y: 0, w: .6, h: .6, sensitivity: 20 },
      { id: 'b', name: 'b', shape: 'ellipse', enabled: true, x: .3, y: .3, w: .6, h: .6, sensitivity: null },
      { id: 'c', name: 'c', shape: 'polygon', enabled: true, points: [[.1, .9], [.9, .9], [.5, .2]], sensitivity: 90 },
    ];
    const g = new MotionDetector({ minIntervalMs: 0 }), c = new MotionDetector({ preferGpu: false, minIntervalMs: 0 });
    g.setAreas(areas); c.setAreas(areas);
    const err = [0, 0, 0]; let n = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      g.analyze(v); c.analyze(v);
      if (i > 3) { n++; for (let k = 0; k < 3; k++) err[k] += Math.abs(g.areaScores[k].score - c.areaScores[k].score); }
    }
    stream.getTracks().forEach((t) => t.stop());
    return { backend: g.backend, perArea: err.map((e) => e / n), count: g.areaScores.length };
  })()`);
  expect(r.backend).toBe("gpu");
  expect(r.count).toBe(3);
  for (const e of r.perArea) expect(e).toBeLessThan(25);   // score points (0-100); frames are sampled independently
});
