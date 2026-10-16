import { test, expect, open, ev, APP, SET, selectTab } from "./helpers.mjs";

const FULL = "s=70&q=9&lang=da&theme=light&sound=1&ss=30&audio=1&clip=3&quality=high&awake=0&preview=canvas"
  + "&area=Door~e~20~20~40~50&area=Hall~p~10,10,50,10,30,60~0&sched=Night~12345~2200~0600~1";

test("query parameters become the settings", async ({ page, errors }) => {
  await open(page, FULL);
  const s = await ev(page, `(async () => { const m = await import('./src/services/settings.js'); const s = m.getSettings();
    return { s: s.sensitivity, q: s.quietPeriodSec, lang: s.language, theme: s.theme, sound: s.soundTrigger, ss: s.soundSensitivity,
      audio: s.recordAudio, clip: s.maxClipMinutes, quality: s.videoQuality, awake: s.keepAwake, preview: s.preview,
      areas: s.detectionAreas.map(a => a.name + ':' + a.shape + ':' + a.enabled), sched: s.schedules.map(x => x.name + ':' + x.days.join('') + ':' + x.start + '-' + x.end) }; })()`);
  expect(s).toEqual({ s: 70, q: 9, lang: "da", theme: "light", sound: true, ss: 30, audio: true, clip: 3, quality: "high", awake: false,
    preview: "canvas", areas: ["Door:ellipse:true", "Hall:polygon:false"], sched: ["Night:12345:22:00-06:00"] });
  expect(await ev(page, `document.documentElement.dataset.theme`)).toBe("light");
  expect(errors).toEqual([]);
});

test("the address bar follows changes and a reload restores them", async ({ page }) => {
  await open(page);
  await selectTab(page, "settings");
  await ev(page, `(() => { const r = ${SET}.querySelector('.sens-range'); r.value = '25'; r.dispatchEvent(new Event('input')); })()`);
  await expect.poll(() => ev(page, `location.search`)).toContain("s=25");
  await page.goto("/");
  await expect.poll(() => ev(page, `location.search`)).toContain("s=25");
  expect(await ev(page, `(async () => (await import('./src/services/settings.js')).getSettings().sensitivity)()`)).toBe(25);
});

test("Reset clears the URL", async ({ page }) => {
  await open(page, "s=70&theme=dark");
  await selectTab(page, "settings");
  await ev(page, `${SET}.querySelector('.reset-btn').click()`);
  await expect.poll(() => ev(page, `location.search`)).toBe("");
  expect(await ev(page, `document.documentElement.dataset.theme`)).toBeUndefined();
});

test("invalid parameters are ignored", async ({ page, errors }) => {
  await open(page, "s=abc&area=bad&sched=x~y&theme=pink&quality=ultra&preview=gpu");
  const s = await ev(page, `(async () => { const s = (await import('./src/services/settings.js')).getSettings(); return [s.sensitivity, s.theme, s.videoQuality, s.preview, s.detectionAreas.length, s.schedules.length]; })()`);
  expect(s).toEqual([40, "auto", "medium", "auto", 0, 0]);
  expect(errors).toEqual([]);
});

test("Copy settings link puts a shareable URL on the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "s=61&sound=1");
  await selectTab(page, "settings");
  await ev(page, `${SET}.querySelector('.copy-link-btn').click()`);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\?s=61&sound=1$/);
  expect(await ev(page, `${APP}.querySelector('.toast')?.textContent`)).toBeTruthy();
});
