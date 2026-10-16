import { test, expect, open, ev, APP, SET } from "./helpers.mjs";

const SHOTS = process.env.MW_SHOTS;
const TABS = `${APP}.querySelector('app-tabs').shadowRoot`;
const badge = (page) => ev(page, `(() => { const b = ${TABS}.querySelector('#tab-recordings .badge'); return b.hidden ? null : b.textContent; })()`);

test("the Recordings tab shows a live clip count", async ({ page, errors }) => {
  await open(page);
  expect(await badge(page)).toBe(null);
  const save = (n) => page.evaluate(async (n) => {
    const { saveRecording } = await import("/src/services/storage.js");
    for (let i = 0; i < n; i++) await saveRecording({ durationSec: 1, mimeType: "video/webm", blob: new Blob(["x"]) });
  }, n);
  await save(3);
  await expect.poll(() => badge(page)).toBe("3");
  expect(await ev(page, `${TABS}.querySelector('#tab-recordings').getAttribute('aria-label')`)).toContain("3");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/badge.png`, clip: { x: 0, y: 0, width: 200, height: 300 } });
  await page.evaluate(async () => {
    const { listRecordings, deleteRecordings } = await import("/src/services/storage.js");
    await deleteRecordings((await listRecordings()).map((r) => r.id));
  });
  await expect.poll(() => badge(page)).toBe(null);
  expect(errors).toEqual([]);
});

test("schedules: 'in 5 minutes', dates, and the end never before the start", async ({ page, errors }) => {
  await open(page);
  await page.getByRole("tab", { name: /Settings/ }).click();
  await ev(page, `${SET}.querySelector('.sched-soon').click()`);
  const sched = () => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => localStorage.getItem(k).includes("schedules")))).schedules[0]);
  let s = await sched();
  expect(s.date).toBeTruthy();
  const from = new Date(`${s.date}T${s.start}`), until = new Date(`${s.endDate}T${s.end}`);
  expect(Math.round((from - Date.now()) / 60000)).toBeGreaterThanOrEqual(4);
  expect(until - from).toBe(3600000);

  // an end before the start is refused with a message
  await page.evaluate((SET) => {
    const root = eval(SET);
    const end = root.querySelector('.sched .end-date');
    end.value = "2000-01-01"; end.dispatchEvent(new Event("change"));
  }, SET);
  expect(await ev(page, `${SET}.querySelector('.sched .err').textContent`)).toMatch(/after/);
  expect((await sched()).endDate).toBe(s.endDate);

  // duration chip
  await ev(page, `${SET}.querySelector('.sched .dur[data-h="8"]').click()`);
  s = await sched();
  expect(new Date(`${s.endDate}T${s.end}`) - new Date(`${s.date}T${s.start}`)).toBe(8 * 3600000);
  expect(await ev(page, `${SET}.querySelector('.sched .err').textContent`)).toBe("");
  if (SHOTS) {
    await page.evaluate((SET) => eval(SET).querySelector('.sched').scrollIntoView({ block: "center" }), SET);
    await page.screenshot({ path: `${SHOTS}/once.png` });
  }

  // back to weekly: day chips and a "next day" hint for overnight windows
  await page.evaluate((SET) => eval(SET).querySelector('.sched input[value="weekly"]').click(), SET);
  expect((await sched()).date).toBeUndefined();
  await ev(page, `${SET}.querySelector('.sched-add').click()`);
  expect(await ev(page, `${SET}.querySelectorAll('.sched')[1].querySelector('.next-day').textContent`)).toMatch(/next day/);
  if (SHOTS) {
    await page.evaluate((SET) => eval(SET).querySelectorAll('.sched')[1].scrollIntoView({ block: "center" }), SET);
    await page.screenshot({ path: `${SHOTS}/weekly.png` });
  }
  expect(errors).toEqual([]);
});
