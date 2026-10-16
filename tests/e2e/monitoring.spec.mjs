import {
  test, expect, open, ev, CAM, CS, APP, SET, selectTab, waitCam, camState, startCamera, noMotion, restoreMotion, clock, clips,
} from "./helpers.mjs";

const hdr = (page) => ev(page, `(() => { const r = ${APP}.querySelector('.rec'); return [r.dataset.state, r.textContent.trim(), r.getAttribute('aria-pressed')]; })()`);
const armed = (page) => ev(page, `${CAM}._armed()`);
const monitorBtn = (page) => ev(page, `${CS}.querySelector('.monitor-btn').click()`);
const headerBtn = (page) => ev(page, `${APP}.querySelector('.rec').click()`);

/** Replace the first schedule's window (as the user would, in Settings). */
async function setWindow(page, from, to) {
  await selectTab(page, "settings");
  await ev(page, `(() => { const li = ${SET}.querySelector('.sched'); const s = li.querySelector('.start'); s.value = '${from}'; s.dispatchEvent(new Event('change'));
    const e = li.querySelector('.end'); e.value = '${to}'; e.dispatchEvent(new Event('change')); })()`);
}

test.describe("monitor now / pause", () => {
  test("monitoring never records blindly: only motion starts a clip", async ({ page, errors }) => {
    await open(page);
    expect((await hdr(page))[1]).toBe("Monitor now");
    await noMotion(page);                                   // nothing moves from the very first frame
    await headerBtn(page);                                  // camera off -> starts camera and monitors
    await expect.poll(() => ev(page, `${CAM}._started`)).toBe(true);
    expect(await armed(page)).toBe(true);
    expect((await hdr(page)).slice(0, 2)).toEqual(["monitoring", "Monitoring"]);
    await page.waitForTimeout(4000);
    expect(await camState(page), "armed but nothing moved").toBe("monitoring");
    await restoreMotion(page);
    await waitCam(page, "recording");
    expect((await hdr(page)).slice(0, 2)).toEqual(["recording", "Recording"]);
    expect(errors).toEqual([]);
  });

  test("pause saves the running clip and stops monitoring; Monitor now resumes", async ({ page }) => {
    await open(page);
    await startCamera(page);
    await waitCam(page, "recording");
    await page.waitForTimeout(1500);                        // clips shorter than ~0.8 s are discarded
    await monitorBtn(page);                                 // = Pause
    await expect.poll(() => clips(page).then((c) => c.length)).toBeGreaterThanOrEqual(1);
    expect(await armed(page)).toBe(false);
    expect(await ev(page, `${CS}.querySelector('status-indicator').getAttribute('state')`)).toBe("paused");
    expect((await hdr(page))[1]).toBe("Monitor now");
    await monitorBtn(page);
    expect(await armed(page)).toBe(true);
  });

  test("the camera power button leaves monitoring state alone", async ({ page }) => {
    await open(page);
    await ev(page, `${CS}.querySelector('.toggle-btn').click()`);
    await expect.poll(() => ev(page, `${CAM}._started`)).toBe(true);
    await ev(page, `${CS}.querySelector('.toggle-btn').click()`);
    await expect.poll(() => ev(page, `${CAM}._started`)).toBe(false);
    expect((await hdr(page))[0]).toBe("idle");
  });
});

test.describe("schedules", () => {
  const outside = () => `sched=Night~0123456~${clock(120, false)}~${clock(180, false)}~1`;

  test("outside a schedule the camera waits and does not record", async ({ page }) => {
    await open(page, outside());
    await startCamera(page);
    await expect.poll(() => armed(page)).toBe(false);
    expect(await ev(page, `${CS}.querySelector('status-indicator').getAttribute('state')`)).toBe("waiting");
    await page.waitForTimeout(3000);
    expect(await camState(page)).toBe("monitoring");
    expect(await ev(page, `${CS}.querySelector('.note').textContent`)).toMatch(/Night/);
  });

  test("Monitor now overrides the schedule until paused", async ({ page }) => {
    await open(page, outside());
    await startCamera(page);
    await monitorBtn(page);
    expect(await armed(page)).toBe(true);
    expect(await ev(page, `${CAM}._override`)).toBe(true);
    expect(await ev(page, `${CS}.querySelector('.note').textContent`)).toMatch(/outside the schedule/);
    await monitorBtn(page);
    expect(await armed(page)).toBe(false);
    expect(await ev(page, `${CAM}._override`)).toBe(false);
  });

  test("inside the window monitoring starts by itself", async ({ page }) => {
    await open(page, `sched=Now~0123456~${clock(-60, false)}~${clock(60, false)}~1`);
    await startCamera(page);
    expect(await armed(page)).toBe(true);
    expect(await ev(page, `${CAM}._override`)).toBe(false);
    await waitCam(page, "recording");
  });

  test("a schedule that starts overrides a pause, a pause inside the window sticks", async ({ page }) => {
    await open(page, outside());
    await startCamera(page);
    await monitorBtn(page); await monitorBtn(page);          // override on, then pause
    expect(await ev(page, `${CAM}._paused`)).toBe(true);

    await setWindow(page, clock(-60), clock(60));            // the window begins now
    await expect.poll(() => armed(page)).toBe(true);
    expect(await ev(page, `${CAM}._paused`)).toBe(false);
    await expect(page.locator("body")).toBeVisible();
    expect(await ev(page, `${APP}.querySelector('.toast')?.textContent`)).toContain("Night");

    await monitorBtn(page);                                  // user pauses inside the window
    await page.waitForTimeout(3500);                         // several schedule evaluations later ...
    expect(await ev(page, `${CAM}._paused`)).toBe(true);
    expect(await armed(page)).toBe(false);

    await setWindow(page, clock(120), clock(180));           // window ends
    await page.waitForTimeout(1500);
    expect(await ev(page, `${CAM}._paused`), "still paused outside").toBe(true);
    await setWindow(page, clock(-60), clock(60));            // next window starts
    await expect.poll(() => armed(page)).toBe(true);
  });

  test("schedule UI: add, edit days and times, status text", async ({ page }) => {
    await open(page);
    await selectTab(page, "settings");
    await ev(page, `${SET}.querySelector('.sched-add').click()`);
    expect(await ev(page, `${SET}.querySelectorAll('.sched').length`)).toBe(1);
    expect(await ev(page, `${SET}.querySelector('.sched-status').textContent`)).toMatch(/Schedule 1/);
    await ev(page, `${SET}.querySelector('.sched .day[data-day="0"]').click()`);   // Sunday off
    const stored = await ev(page, `JSON.parse(localStorage.getItem('motionwatch-settings-v1')).schedules[0]`);
    expect(stored.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await ev(page, `${SET}.querySelector('.sched .day[data-day="0"]').getAttribute('aria-pressed')`)).toBe("false");
    await ev(page, `${SET}.querySelector('.sched .del').click()`);
    expect(await ev(page, `${SET}.querySelectorAll('.sched').length`)).toBe(0);
  });
});

test.describe("which schedule is it?", () => {
  const header = (page) => ev(page, `${APP}.querySelector('.rec-sub').textContent`);

  test("the header names the schedule and when it starts, even before the camera is on", async ({ page }) => {
    const from = clock(120);
    await open(page, `sched=Night~0123456~${clock(120, false)}~${clock(180, false)}~1`);
    const line = `Schedule “Night” · starts ${from}, until ${clock(180)}`;
    expect(await header(page), "start and end of the window").toBe(line);
    expect(await ev(page, `${CS}.querySelector('.sched-line').textContent`), "also on the camera start screen").toBe(line);
    expect(await ev(page, `${APP}.querySelector('.rec-sub').hidden`)).toBe(false);
  });

  test("it keeps naming the schedule while the camera waits, and says 'until' once the window runs", async ({ page }) => {
    await open(page, `sched=Night~0123456~${clock(120, false)}~${clock(180, false)}~1`);
    await startCamera(page);
    await expect.poll(() => armed(page)).toBe(false);
    expect(await header(page)).toMatch(/^Schedule “Night” · starts \d\d:\d\d, until \d\d:\d\d$/);
    expect(await ev(page, `${CS}.querySelector('.note').textContent`)).toBe(await header(page));

    await setWindow(page, clock(-60), clock(60));
    await expect.poll(() => header(page)).toBe(`Schedule “Night” · from ${clock(-60)} until ${clock(60)}`);
  });

  test("with several schedules the next one to start is named", async ({ page }) => {
    await open(page, `sched=Late~0123456~${clock(300, false)}~${clock(360, false)}~1&sched=Soon~0123456~${clock(90, false)}~${clock(150, false)}~1`);
    expect(await header(page)).toBe(`Schedule “Soon” · starts ${clock(90)}, until ${clock(150)}`);
  });

  test("no schedules: nothing to show", async ({ page }) => {
    await open(page);
    expect(await ev(page, `${APP}.querySelector('.rec-sub').hidden`)).toBe(true);
    expect(await ev(page, `${CS}.querySelector('.sched-line').hidden`)).toBe(true);
  });
});

test.describe("stop countdown and limits", () => {
  test("a countdown runs to zero before the clip stops", async ({ page }) => {
    await open(page, "q=5");
    await startCamera(page);
    await waitCam(page, "recording");
    await noMotion(page);
    const seen = [];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(400);
      const v = await ev(page, `${CAM}._countdown`);
      if (v != null && seen.at(-1) !== v) seen.push(v);
    }
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen[0]).toBeLessThanOrEqual(5);
    expect(seen, "strictly decreasing").toEqual([...seen].sort((a, b) => b - a));
    expect(await ev(page, `(() => { const c = ${CS}.querySelector('.countdown'); return c.hidden; })()`)).toBe(true);
    await expect.poll(() => camState(page)).not.toBe("recording");
  });

  test("a changed quiet period applies without restarting", async ({ page }) => {
    await open(page, "q=20");
    await startCamera(page);
    await waitCam(page, "recording");
    await noMotion(page);
    await page.waitForTimeout(1500);
    expect(await ev(page, `${CAM}._countdown`)).toBeGreaterThan(10);
    await selectTab(page, "settings");
    await ev(page, `(() => { const i = ${SET}.querySelector('.quiet-input'); i.value = '3'; i.dispatchEvent(new Event('change')); })()`);
    await expect.poll(() => ev(page, `${CAM}._countdown`)).toBeLessThanOrEqual(3);
  });
});
