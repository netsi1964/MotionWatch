import { test, expect, open, ev, CAM, CS, LIST, selectTab, startCamera, waitCam, clips, noMotion } from "./helpers.mjs";

/** Decode a stored clip's audio with Web Audio; resolves { decoded, duration, rms } or { decoded: false }. */
const analyseAudio = (page) => ev(page, `(async () => {
  const m = await import('./src/services/storage.js');
  const r = (await m.listRecordings())[0];
  const buf = await r.blob.arrayBuffer();
  try {
    const ctx = new AudioContext();
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    let sum = 0; for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    return { decoded: true, duration: audio.duration, rms: Math.sqrt(sum / ch.length), mime: r.mimeType };
  } catch (e) { return { decoded: false, error: String(e), mime: r.mimeType }; }
})()`);

async function recordClip(page, { stopAfter = 3000 } = {}) {
  await startCamera(page);
  await waitCam(page, "recording");
  await page.waitForTimeout(stopAfter);
  await ev(page, `${CAM}.motion.isMotion = () => false`);
  await ev(page, `${CAM}.recorder.stopRecording(false)`);
  await expect.poll(() => clips(page).then((c) => c.length)).toBeGreaterThanOrEqual(1);
}

test("with 'Record sound' on the saved clip really contains audible audio", async ({ page, errors }) => {
  await open(page, "audio=1");
  await recordClip(page);
  const [c] = await clips(page);
  expect(c.hasAudio).toBe(true);
  const a = await analyseAudio(page);
  expect(a.decoded, a.error).toBe(true);
  expect(a.duration).toBeGreaterThan(1);
  expect(a.rms, "not silence").toBeGreaterThan(0.005);
  expect(errors).toEqual([]);
});

test("with 'Record sound' off the clip has no audio track and no microphone is opened", async ({ page }) => {
  await open(page);
  await recordClip(page);
  expect((await clips(page))[0].hasAudio).toBe(false);
  expect(await ev(page, `${CAM}.recorder.hasAudio`)).toBe(false);
  const a = await analyseAudio(page);
  expect(a.decoded).toBe(false);
});

test("the Sound button on the camera tab switches audio on, saving the running clip first", async ({ page }) => {
  await open(page);
  await startCamera(page);
  await waitCam(page, "recording");
  await page.waitForTimeout(2200);
  expect(await ev(page, `${CS}.querySelector('.audio-btn').getAttribute('aria-pressed')`)).toBe("false");
  await ev(page, `${CS}.querySelector('.audio-btn').click()`);
  await expect.poll(() => ev(page, `${CAM}.recorder.hasAudio`), { timeout: 30_000 }).toBe(true);
  await waitCam(page, "recording");
  await expect.poll(() => ev(page, `${CAM}.recorder.mediaRecorder?.stream.getAudioTracks().length`)).toBe(1);
  expect(await ev(page, `${CS}.querySelector('.audio-btn').getAttribute('aria-pressed')`)).toBe("true");
  expect(await ev(page, `JSON.parse(localStorage.getItem('motionwatch-settings-v1')).recordAudio`)).toBe(true);
  const list = await clips(page);
  expect(list.some((c) => c.hasAudio === false), "the interrupted clip was kept").toBe(true);
});

test("clips with sound are marked in the list", async ({ page }) => {
  await open(page, "audio=1");
  await recordClip(page);
  await selectTab(page, "recordings");
  await expect.poll(() => ev(page, `${LIST}.querySelectorAll('.duration .ico').length`)).toBe(1);
  expect(await ev(page, `${LIST}.querySelector('.meta .sub').textContent`)).toContain("With sound");
});

test("a pause survives the camera restart caused by turning sound on", async ({ page }) => {
  await open(page);
  await startCamera(page);
  const dbg = await ev(page, `[${CAM}.state, ${CAM}._paused, ${CAM}._armed(), ${CS}.querySelector('.monitor-btn').disabled]`);
  await ev(page, `${CS}.querySelector('.monitor-btn').click()`);   // pause (always-armed -> paused)
  expect(await ev(page, `${CAM}._paused`), JSON.stringify(dbg)).toBe(true);
  await ev(page, `${CS}.querySelector('.audio-btn').click()`);
  await expect.poll(() => ev(page, `${CAM}.recorder.hasAudio`), { timeout: 30_000 }).toBe(true);
  expect(await ev(page, `${CAM}._paused`)).toBe(true);
});

test.describe("sound trigger", () => {
  test("loud sound starts a clip without any motion, and the mic is not recorded unless asked", async ({ page }) => {
    await open(page, "sound=1&ss=100");
    await startCamera(page);
    await expect(async () => {
      expect(await ev(page, `!${CS}.querySelector('.sound-row').hidden`)).toBe(true);
    }).toPass();
    expect(await ev(page, `${CAM}.recorder.hasAudio && !${CAM}.recorder.includeAudio`)).toBe(true);
    await noMotion(page);
    await waitCam(page, "recording", 30_000);
    expect(await ev(page, `${CAM}.recorder.mediaRecorder.stream.getAudioTracks().length`)).toBe(0);
  });

  test("the sound meter and its trigger tick follow the sensitivity", async ({ page }) => {
    await open(page, "sound=1");
    await startCamera(page);
    await ev(page, `${CAM}.motion.isMotion = () => false`);
    const tick = () => ev(page, `getComputedStyle(${CS}.querySelector('.smeter')).getPropertyValue('--tick')`);
    const low = parseFloat(await tick());
    await ev(page, `(() => { const r = ${CS}.querySelector('.ssens-range'); r.value = '90'; r.dispatchEvent(new Event('input')); })()`);
    const high = parseFloat(await tick());
    expect(high).toBeLessThan(low);
  });

  test("with the trigger off there is no sound UI and no microphone", async ({ page }) => {
    await open(page);
    await startCamera(page);
    expect(await ev(page, `${CS}.querySelector('.sound-row').hidden`)).toBe(true);
    expect(await ev(page, `${CS}.querySelector('.sound-sens').hidden`)).toBe(true);
    expect(await ev(page, `${CAM}.recorder.hasAudio`)).toBe(false);
  });
});
