import { test as base, expect } from "@playwright/test";

export { expect };

/** Console/page errors collected per test; specs assert it stays empty. */
export const test = base.extend({
  errors: async ({ page }, use) => {
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await use(errs);
  },
});

// Expression snippets that reach into the nested shadow roots (evaluated in the page).
export const APP = `document.querySelector('motion-app').shadowRoot`;
export const CAM = `${APP}.querySelector('camera-monitor')`;
export const CS = `${CAM}.shadowRoot`;
export const SET = `${APP}.querySelector('motion-settings').shadowRoot`;
export const LIST = `${APP}.querySelector('recording-list').shadowRoot`;
export const ED = `${SET}.querySelector('area-editor').shadowRoot`;

export const ev = (page, expr) => page.evaluate(expr);

export async function open(page, query = "") {
  await page.goto(query ? `/?${query}` : "/");
  await page.waitForFunction(() => !!document.querySelector("motion-app")?.shadowRoot?.querySelector("camera-monitor"));
}

export const camState = (page) => ev(page, `${CAM}.state`);
export const waitCam = (page, state, timeout = 20_000) => expect.poll(() => camState(page), { timeout }).toBe(state);
export const selectTab = (page, tab) => ev(page, `${APP}.querySelector('app-tabs').select('${tab}')`);

/** HHMM / HH:MM of a time `offsetMin` minutes from now. */
export function clock(offsetMin = 0, colon = true) {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
  return colon ? `${hh}:${mm}` : `${hh}${mm}`;
}

/** Newest-first list of stored clips (metadata only). */
export const clips = (page) => ev(page, `(async () => {
  const m = await import('./src/services/storage.js');
  return (await m.listRecordings()).map((r) => ({ id: r.id, hasAudio: !!r.hasAudio, poster: !!r.poster, posterType: r.poster && r.poster.type,
    posterSize: r.poster && r.poster.size, durationSec: r.durationSec, size: r.sizeBytes, mime: r.mimeType }));
})()`);

/** Pretend nothing moves so only deliberate triggers (sound) can start a clip. */
export const noMotion = (page) => ev(page, `${CAM}.motion.isMotion = () => false`);
export const restoreMotion = (page) => ev(page, `delete ${CAM}.motion.isMotion`);

/** Start the camera through the UI's own code path and wait until it is up. */
export async function startCamera(page) {
  await ev(page, `${CAM}.startMonitoring()`);
  await expect.poll(() => ev(page, `${CAM}._started`)).toBe(true);
}
