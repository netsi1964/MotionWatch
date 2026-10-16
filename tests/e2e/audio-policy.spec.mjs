import { test, expect, open, ev, APP, CAM, CS, SET, selectTab, waitCam, noMotion } from "./helpers.mjs";

/**
 * Emulates Safari's audio policy: an AudioContext only runs if it is created or resumed while a real
 * pointer gesture is active. (Playwright's evaluate() counts as a gesture, so a flag set by a real
 * pointerdown is used instead.) A context created later stays "suspended" and reads silence.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__gesture = false;
    document.addEventListener("pointerdown", () => { window.__gesture = true; setTimeout(() => { window.__gesture = false; }, 400); }, true);
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig {
      constructor(...a) {
        super(...a);
        if (!window.__gesture) this.suspend().catch(() => {});
        const resume = this.resume.bind(this);
        this.resume = () => (window.__gesture ? resume() : Promise.reject(new DOMException("needs a user gesture", "NotAllowedError")));
      }
    };
  });
});

/** A real mouse click in the middle of an element reached through shadow roots. */
async function realClick(page, expr) {
  await ev(page, `${expr}.scrollIntoView({ block: "center" })`);
  const [x, y] = await ev(page, `(() => { const r = ${expr}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.mouse.click(x, y);
}

const ctxState = (page) => ev(page, `${CAM}.sound.ctx ? ${CAM}.sound.ctx.state : 'none'`);
const level = (page) => ev(page, `${CAM}.sound.level`);

test("starting the camera with a real tap gives a live microphone level and sound can trigger a clip", async ({ page, errors }) => {
  await open(page, "sound=1&ss=100");
  await realClick(page, `${CS}.querySelector('.toggle-btn')`);
  await expect.poll(() => ev(page, `${CAM}._started`)).toBe(true);
  await expect.poll(() => ctxState(page)).toBe("running");
  await expect(async () => expect(await level(page)).toBeGreaterThan(5)).toPass({ timeout: 20_000 });
  expect(await ev(page, `${CS}.querySelector('.sound-db').textContent`)).toMatch(/-?\d+ dB/);
  expect(await ev(page, `${CS}.querySelector('.notice').hidden`)).toBe(true);

  await noMotion(page);
  await waitCam(page, "recording", 30_000);
  expect(errors).toEqual([]);
});

test("a blocked audio context is explained and any tap unlocks it", async ({ page }) => {
  await open(page, "audio=1");                                   // microphone open, but no real gesture yet
  await ev(page, `${CAM}.startMonitoring()`);
  await expect.poll(() => ctxState(page)).toBe("suspended");
  await expect.poll(() => ev(page, `${CS}.querySelector('.notice').textContent`), { timeout: 10_000 }).toMatch(/blocking sound/);
  expect(await level(page)).toBe(0);

  await realClick(page, `${APP}.querySelector('.app-title')`);   // any tap on the page
  await expect.poll(() => ctxState(page)).toBe("running");
  await expect.poll(() => ev(page, `${CS}.querySelector('.notice').hidden`), { timeout: 10_000 }).toBe(true);
  await expect(async () => expect(await level(page)).toBeGreaterThan(5)).toPass({ timeout: 20_000 });
});

test("the level meter also shows when sound is only recorded (no trigger): no trigger tick, no sensitivity slider", async ({ page }) => {
  await open(page, "audio=1");
  await realClick(page, `${CS}.querySelector('.toggle-btn')`);
  await expect.poll(() => ev(page, `!${CS}.querySelector('.sound-row').hidden`)).toBe(true);
  expect(await ev(page, `${CS}.querySelector('.smeter').classList.contains('no-trigger')`)).toBe(true);
  expect(await ev(page, `${CS}.querySelector('.sound-sens').hidden`)).toBe(true);
});

test("a muted microphone track is reported on screen", async ({ page }) => {
  await open(page, "audio=1");
  await realClick(page, `${CS}.querySelector('.toggle-btn')`);
  await expect.poll(() => ctxState(page)).toBe("running");
  await ev(page, `(() => { const t = ${CAM}.recorder.stream.getAudioTracks()[0]; window.__mutedValue = true; Object.defineProperty(Object.getPrototypeOf(t), 'muted', { configurable: true, get: () => window.__mutedValue }); t.dispatchEvent(new Event('mute')); })()`);
  expect(await ev(page, `${CS}.querySelector('.notice').textContent`)).toMatch(/muted by the system/);
  await ev(page, `(() => { const t = ${CAM}.recorder.stream.getAudioTracks()[0]; window.__mutedValue = false; t.dispatchEvent(new Event('unmute')); })()`);
  await expect.poll(() => ev(page, `${CS}.querySelector('.notice').hidden`)).toBe(true);
});

test("Settings → Test microphone shows the live level and stops again", async ({ page }) => {
  await open(page);
  await selectTab(page, "settings");
  await realClick(page, `${SET}.querySelector('.mic-test-btn')`);
  await expect.poll(() => ev(page, `${SET}.querySelector('.mic-test-btn span').textContent`)).toBe("Stop test");
  await expect(async () => expect(await ev(page, `parseFloat(${SET}.querySelector('.mic-fill').style.width)`)).toBeGreaterThan(5)).toPass({ timeout: 20_000 });
  expect(await ev(page, `${SET}.querySelector('.mic-db').textContent`)).toMatch(/-?\d+ dB/);
  await realClick(page, `${SET}.querySelector('.mic-test-btn')`);
  await expect.poll(() => ev(page, `${SET}.querySelector('.mic-test-btn span').textContent`)).toBe("Test microphone");
  expect(await ev(page, `${SET}.querySelector('.mic-fill').style.width`)).toBe("0%");
  expect(await ev(page, `${APP}.querySelector('camera-monitor')._started`), "the test does not start the camera").toBe(false);
});

test("the Camera and Sound buttons show their state: icon, On/Off chip, aria-pressed and tooltip", async ({ page }) => {
  await open(page);
  const read = (sel) => ev(page, `(() => { const b = ${CS}.querySelector('${sel}'); return { pressed: b.getAttribute('aria-pressed'), chip: b.querySelector('.dock-state').textContent,
    label: b.querySelector('.dock-label').textContent, icon: b.querySelector('.dock-ico').dataset.icon, title: b.title, on: b.classList.contains('on') }; })()`);

  expect(await read(".toggle-btn")).toMatchObject({ pressed: "false", chip: "Off", label: "Camera", icon: "cameraOff", on: false });
  expect(await read(".audio-btn")).toMatchObject({ pressed: "false", chip: "Off", label: "Sound", icon: "micOff", on: false });
  expect((await read(".toggle-btn")).title).toMatch(/off – tap to turn it on/);

  await realClick(page, `${CS}.querySelector('.toggle-btn')`);
  await expect.poll(() => read(".toggle-btn")).toMatchObject({ pressed: "true", chip: "On", icon: "camera", on: true });
  expect((await read(".toggle-btn")).title).toMatch(/on – tap to turn it off/);

  await realClick(page, `${CS}.querySelector('.audio-btn')`);
  await expect.poll(() => read(".audio-btn")).toMatchObject({ pressed: "true", chip: "On", icon: "mic", on: true });
  await expect.poll(() => ev(page, `${CAM}.recorder.hasAudio`), { timeout: 30_000 }).toBe(true);   // camera restarted with the microphone
  expect(await read(".toggle-btn")).toMatchObject({ pressed: "true", chip: "On" });

  await realClick(page, `${CS}.querySelector('.toggle-btn')`);
  await expect.poll(() => read(".toggle-btn")).toMatchObject({ pressed: "false", chip: "Off", icon: "cameraOff" });
});
