import { test, expect, open, ev, APP, CAM, CS, SET, ED, selectTab, startCamera } from "./helpers.mjs";

const rawBox = (page) => ev(page, `(() => { const r = ${ED}.querySelector('.stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
/** The stage box once the layout has stopped moving (aspect ratio follows the video size). */
async function stageBox(page) {
  let prev = await rawBox(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const cur = await rawBox(page);
    if (cur.every((v, k) => Math.abs(v - prev[k]) < 0.5)) return cur;
    prev = cur;
  }
  return prev;
}
const areas = (page) => ev(page, `${SET}.querySelector('area-editor').areas.map(a => ({ n: a.name, s: a.shape, en: a.enabled,
  x: a.x != null ? +a.x.toFixed(2) : null, y: a.y != null ? +a.y.toFixed(2) : null, w: a.w != null ? +a.w.toFixed(2) : null, h: a.h != null ? +a.h.toFixed(2) : null,
  pts: a.points ? a.points.length : null }))`);
const handleCentre = (page, sel) => ev(page, `(() => { const r = ${ED}.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

async function openEditor(page, query = "") {
  await open(page, query);
  await selectTab(page, "settings");
  await ev(page, `${SET}.querySelector('.region-edit-btn').click()`);
  await expect.poll(() => ev(page, `${ED}.querySelector('video')?.readyState`)).toBeGreaterThanOrEqual(2);
}

test("draw, move and resize an area on the live picture", async ({ page, errors }) => {
  await openEditor(page);
  const B = await stageBox(page);
  const at = (fx, fy) => [B[0] + B[2] * fx, B[1] + B[3] * fy];

  await page.mouse.move(...at(0.1, 0.1)); await page.mouse.down();
  await page.mouse.move(...at(0.4, 0.5), { steps: 5 }); await page.mouse.up();
  let a = (await areas(page))[0];
  expect(a).toMatchObject({ n: "Area 1", s: "rect", x: 0.1, y: 0.1, w: 0.3 });
  expect(a.h).toBeCloseTo(0.4, 1);

  await page.mouse.move(...at(0.15, 0.15)); await page.mouse.down();          // drag the body
  await page.mouse.move(...at(0.35, 0.25), { steps: 5 }); await page.mouse.up();
  a = (await areas(page))[0];
  expect(a.x).toBeCloseTo(0.3, 1);
  expect(a.y).toBeCloseTo(0.2, 1);
  expect(a.w).toBeCloseTo(0.3, 1);

  const se = await handleCentre(page, '.handle[data-h="se"]');                // drag the SE corner
  await page.mouse.move(...se); await page.mouse.down();
  await page.mouse.move(se[0] + B[2] * 0.2, se[1] + B[3] * 0.1, { steps: 5 }); await page.mouse.up();
  a = (await areas(page))[0];
  expect(a.w).toBeCloseTo(0.5, 1);
  expect(errors).toEqual([]);
});

test("areas stay inside the frame and keep a minimum size", async ({ page }) => {
  await openEditor(page);
  await ev(page, `${ED}.querySelector('.add-rect').click()`);
  await ev(page, `(() => { const i = ${ED}.querySelector('#ae-w'); i.value = '1'; i.dispatchEvent(new Event('input')); })()`);
  await ev(page, `(() => { const i = ${ED}.querySelector('#ae-x'); i.value = '99'; i.dispatchEvent(new Event('input')); })()`);
  const a = (await areas(page))[0];
  expect(a.w).toBeGreaterThanOrEqual(0.04);
  expect(a.x + a.w).toBeLessThanOrEqual(1.0001);
});

test("change shape, edit polygon points, rename, toggle and save", async ({ page }) => {
  await openEditor(page);
  await ev(page, `${ED}.querySelector('.add-ellipse').click()`);
  await ev(page, `${ED}.querySelector('.add-polygon').click()`);
  expect((await areas(page)).map((a) => a.s)).toEqual(["ellipse", "polygon"]);

  const v0 = await handleCentre(page, '.handle.vertex[data-i="0"]');          // drag a vertex
  await page.mouse.move(...v0); await page.mouse.down();
  await page.mouse.move(v0[0] - 40, v0[1] - 30, { steps: 4 }); await page.mouse.up();
  const m = await handleCentre(page, '.handle.mid[data-i="1"]');              // drag an edge midpoint = new vertex
  await page.mouse.move(...m); await page.mouse.down();
  await page.mouse.move(m[0] + 30, m[1] - 20, { steps: 4 }); await page.mouse.up();
  expect((await areas(page))[1].pts).toBe(5);
  await ev(page, `${ED}.querySelector('.handle.vertex[data-i="2"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  expect((await areas(page))[1].pts).toBe(4);

  await ev(page, `${ED}.querySelector('li.row').click()`);                  // select the ellipse row
  await ev(page, `(() => { const s = ${ED}.querySelector('#ae-shape'); s.value = 'polygon'; s.dispatchEvent(new Event('change')); })()`);  // ellipse -> polygon
  expect((await areas(page)).map((a) => a.s)).toEqual(["polygon", "polygon"]);

  await ev(page, `(() => { const rows = ${ED}.querySelectorAll('li.row'); const n = rows[0].querySelector('.name'); n.value = 'Door'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('blur'));
    const c = rows[1].querySelector('.enabled'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
  await ev(page, `${SET}.querySelector('.save').click()`);
  expect(await ev(page, `${SET}.querySelector('.region-val').textContent`)).toBe("2 area(s): Door, Area 2 (off)");
  const stored = await ev(page, `JSON.parse(localStorage.getItem('motionwatch-settings-v1')).detectionAreas.map(a => a.name + ':' + a.shape + ':' + a.enabled)`);
  expect(stored).toEqual(["Door:polygon:true", "Area 2:polygon:false"]);
  await expect.poll(() => ev(page, `location.search`)).toContain("area=Door~p~");
});

test("the editor is operable with the keyboard", async ({ page }) => {
  await openEditor(page);
  await ev(page, `${ED}.querySelector('.add-rect').click()`);
  const before = (await areas(page))[0];
  await ev(page, `${ED}.querySelector('.handle.move').focus()`);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const after = (await areas(page))[0];
  expect(after.x - before.x).toBeCloseTo(0.01, 2);
  expect(after.y - before.y).toBeCloseTo(0.05, 2);
  await ev(page, `${ED}.querySelector('.handle[data-h="e"]').focus()`);
  await page.keyboard.press("ArrowRight");
  expect((await areas(page))[0].w - before.w).toBeCloseTo(0.01, 2);
  await page.keyboard.press("Escape");
  expect(await ev(page, `!${SET}.querySelector('.area-dialog')`)).toBe(true);
});

test("Cancel discards and Use whole screen clears", async ({ page }) => {
  await openEditor(page, "area=Door~e~20~20~40~50");
  await ev(page, `${ED}.querySelector('.add-rect').click()`);
  await ev(page, `${SET}.querySelector('.cancel').click()`);
  expect(await ev(page, `${SET}.querySelector('.region-val').textContent`)).toBe("1 area(s): Door");
  await ev(page, `${SET}.querySelector('.region-clear-btn').click()`);
  expect(await ev(page, `${SET}.querySelector('.region-val').textContent`)).toBe("Whole screen (default)");
  await expect.poll(() => ev(page, `location.search`)).not.toContain("area=");
});

test("each area can have its own sensitivity, saved and shared via the URL", async ({ page }) => {
  await openEditor(page, "s=55");
  await ev(page, `${ED}.querySelector('.add-rect').click()`);
  const read = () => ev(page, `(() => ({ inherit: ${ED}.querySelector('#ae-inherit').checked, disabled: ${ED}.querySelector('#ae-sens').disabled,
    value: ${ED}.querySelector('#ae-sens').value, label: ${ED}.querySelector('.f-inherit-l').textContent }))()`);
  expect(await read()).toEqual({ inherit: true, disabled: true, value: "55", label: "Same as global (55)" });

  await ev(page, `(() => { const c = ${ED}.querySelector('#ae-inherit'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
  expect(await read()).toMatchObject({ inherit: false, disabled: false, value: "55" });
  await ev(page, `(() => { const r = ${ED}.querySelector('#ae-sens'); r.value = '80'; r.dispatchEvent(new Event('input')); })()`);
  expect(await ev(page, `${ED}.querySelector('li.row .shape-tag').textContent`)).toBe("Rectangle · 80");
  expect(await ev(page, `${ED}.querySelector('.stage .label').textContent`)).toBe("Area 1 · 80");

  await ev(page, `${ED}.querySelector('.add-ellipse').click()`);                       // a second area keeps following the global one
  expect((await read()).inherit).toBe(true);

  await ev(page, `${SET}.querySelector('.save').click()`);
  const stored = await ev(page, `JSON.parse(localStorage.getItem('motionwatch-settings-v1')).detectionAreas.map(a => [a.name, a.sensitivity])`);
  expect(stored).toEqual([["Area 1", 80], ["Area 2", null]]);
  await expect.poll(() => ev(page, `location.search`)).toMatch(/area=Area[ +]1~r~[\d.]+~[\d.]+~[\d.]+~[\d.]+~s80/);

  // reload from the URL alone
  const url = await ev(page, `location.href`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  const again = await ev(page, `(async () => (await import('./src/services/settings.js')).getSettings().detectionAreas.map(a => a.sensitivity))()`);
  expect(again).toEqual([80, null]);
});

test("the live overlay shows an area's own sensitivity and highlights the area that triggers", async ({ page }) => {
  await open(page, "area=Door~e~20~20~40~50~s100&area=Hall~r~60~60~30~30~s0");
  await startCamera(page);
  await expect.poll(() => ev(page, `[...${CS}.querySelectorAll('.areas-box .label')].map(l => l.textContent)`)).toEqual(["Door · 100", "Hall · 0"]);
  await expect.poll(() => ev(page, `${CS}.querySelector('.areas-box .label[data-id]').hasAttribute('data-hot')`), { timeout: 30_000 }).toBe(true);
});

test("the live picture overlay shows the saved, named areas", async ({ page }) => {
  await open(page, "area=Door~e~20~20~40~50&area=Hall~r~60~60~30~30~0");
  await startCamera(page);
  await expect.poll(() => ev(page, `${CS}.querySelector('.areas-box').style.display`)).toBe("block");
  expect(await ev(page, `[...${CS}.querySelectorAll('.areas-box .label')].map(l => l.textContent)`)).toEqual(["Door", "Hall"]);
});

test.describe("detection masks", () => {
  test("only pixels inside the enabled areas count, on GPU and CPU alike", async ({ page }) => {
    await open(page);
    const r = await ev(page, `(async () => {
      const { MotionDetector } = await import('./src/services/motion.js');
      const out = {};
      const sets = {
        whole: [],
        ellipse: [{ id: 'e', name: 'e', shape: 'ellipse', enabled: true, x: .1, y: .1, w: .8, h: .8 }],
        triangle: [{ id: 't', name: 't', shape: 'polygon', enabled: true, points: [[.5, .1], [.9, .9], [.1, .9]] }],
        onlyDisabled: [{ id: 'o', name: 'o', shape: 'rect', enabled: false, x: .1, y: .1, w: .2, h: .2 }],
        two: [{ id: 'a', name: 'a', shape: 'rect', enabled: true, x: 0, y: 0, w: .5, h: .5 }, { id: 'b', name: 'b', shape: 'rect', enabled: true, x: .5, y: .5, w: .5, h: .5 }],
      };
      for (const [k, areas] of Object.entries(sets)) { const d = new MotionDetector(); d.setAreas(areas); out[k] = d.unionCount; }
      return out;
    })()`);
    expect(r.whole).toBe(160 * 90);
    expect(r.ellipse).toBeGreaterThan(160 * 90 * 0.8 * 0.8 * Math.PI / 4 * 0.97);
    expect(r.ellipse).toBeLessThan(160 * 90 * 0.8 * 0.8 * Math.PI / 4 * 1.03);
    expect(r.triangle).toBeGreaterThan(160 * 90 * 0.32 * 0.97);
    expect(r.triangle).toBeLessThan(160 * 90 * 0.32 * 1.03);
    expect(r.onlyDisabled, "nothing active = whole frame").toBe(160 * 90);
    expect(r.two).toBe(80 * 45 * 2);
  });
});
