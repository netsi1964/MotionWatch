import { test, expect, open, ev, APP, LIST, CAM, CS, selectTab, startCamera, waitCam, clips } from "./helpers.mjs";
import fs from "node:fs";

/** Show the Recordings tab and wait until `n` cards are rendered (the list loads asynchronously). */
async function openList(page, n = 1) {
  await selectTab(page, "recordings");
  await expect.poll(() => ev(page, `${LIST}.querySelectorAll('.card').length`)).toBe(n);
}

/** Record one short clip through the real pipeline. */
async function makeClip(page, query = "") {
  await startCamera(page);
  await waitCam(page, "recording");
  await page.waitForTimeout(2500);
  await ev(page, `${CAM}.motion.isMotion = () => false`);
  await ev(page, `${CAM}.recorder.stopRecording(false)`);
  await expect.poll(() => clips(page).then((c) => c.length)).toBeGreaterThanOrEqual(1);
  await ev(page, `delete ${CAM}.motion.isMotion`);
}

test("a clip is stored with a JPEG preview frame and listed with it", async ({ page, errors }) => {
  await open(page);
  await makeClip(page);
  const [c] = await clips(page);
  expect(c.poster).toBe(true);
  expect(c.posterType).toBe("image/jpeg");
  expect(c.posterSize).toBeGreaterThan(1000);
  expect(c.durationSec).toBeGreaterThan(0.8);

  await selectTab(page, "recordings");
  await expect.poll(() => ev(page, `${LIST}.querySelectorAll('.thumb img').length`)).toBe(1);
  expect(await ev(page, `${LIST}.querySelector('.count').textContent`)).toBe("1 clips");
  expect(errors).toEqual([]);
});

test("the player opens, plays and closes with Escape", async ({ page }) => {
  await open(page);
  await makeClip(page);
  await openList(page);
  await ev(page, `${LIST}.querySelector('.thumb').click()`);
  await expect.poll(() => ev(page, `(() => { const v = ${LIST}.querySelector('.player video'); return v && v.readyState; })()`)).toBeGreaterThanOrEqual(2);
  expect(await ev(page, `${LIST}.querySelector('.player video').controls`)).toBe(true);
  await page.keyboard.press("Escape");
  expect(await ev(page, `!${LIST}.querySelector('.player')`)).toBe(true);
});

test("deleting asks for confirmation", async ({ page }) => {
  await open(page);
  await makeClip(page);
  await openList(page);
  await ev(page, `${LIST}.querySelector('.card .del').click()`);
  expect(await ev(page, `!!${LIST}.querySelector('[role=alertdialog]')`)).toBe(true);
  await ev(page, `${LIST}.querySelector('.cancel').click()`);
  expect((await clips(page)).length).toBe(1);
  await ev(page, `${LIST}.querySelector('.card .del').click()`);
  await ev(page, `${LIST}.querySelector('.confirm').click()`);
  await expect.poll(() => clips(page).then((c) => c.length)).toBe(0);
  expect(await ev(page, `${LIST}.querySelector('.empty').hidden`)).toBe(false);
});

test("a download and a ZIP export are offered", async ({ page }) => {
  await open(page);
  await makeClip(page);
  await openList(page);
  const one = page.waitForEvent("download");
  await ev(page, `${LIST}.querySelector('.card .actions button').click()`);
  expect((await one).suggestedFilename()).toMatch(/^motionwatch-.*\.(webm|mp4)$/);

  const zip = page.waitForEvent("download");
  await ev(page, `${LIST}.querySelector('.zip-btn').click()`);
  const d = await zip;
  expect(d.suggestedFilename()).toMatch(/^motionwatch-export-\d+\.zip$/);
  const buf = fs.readFileSync(await d.path());
  expect(buf.subarray(0, 2).toString()).toBe("PK");
});

test("bulk selection enables Delete selected", async ({ page }) => {
  await open(page);
  await makeClip(page);
  await openList(page);
  expect(await ev(page, `${LIST}.querySelector('.delete-sel-btn').disabled`)).toBe(true);
  await ev(page, `${LIST}.querySelector('.select-all-btn').click()`);
  expect(await ev(page, `${LIST}.querySelector('.delete-sel-btn').disabled`)).toBe(false);
  expect(await ev(page, `${LIST}.querySelector('.count').textContent`)).toBe("1 selected");
});

/** Files inside a ZIP written with level 0 (stored), which is how the app writes them. */
function unzipStored(buf) {
  const files = {};
  for (let i = 0; i + 30 < buf.length;) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString();
    const start = i + 30 + nameLen + extraLen;
    files[name] = buf.subarray(start, start + size);
    i = start + size;
  }
  return files;
}

/** Duration of a video file (bytes) as the browser sees it, also for MediaRecorder files without a duration header. */
const mediaDuration = (page, bytes, mime) => page.evaluate(async ({ b64, mime }) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const v = document.createElement("video");
  v.preload = "auto"; v.muted = true;
  v.src = URL.createObjectURL(new Blob([arr], { type: mime }));
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("cannot load")); });
  if (!Number.isFinite(v.duration)) {
    v.currentTime = 1e7;
    await new Promise((res) => { v.ondurationchange = () => Number.isFinite(v.duration) && res(); v.onseeked = res; });
  }
  return v.duration;
}, { b64: bytes.toString("base64"), mime });

/** Longest stretch (seconds) of black frames while playing the video through in real time. */
const longestBlackRun = (page, bytes, mime) => page.evaluate(async ({ b64, mime }) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true;
  v.src = URL.createObjectURL(new Blob([arr], { type: mime }));
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("cannot load")); });
  const c = document.createElement("canvas"); c.width = 32; c.height = 18;
  const x = c.getContext("2d", { willReadFrequently: true });
  let blackStart = null, longest = 0, last = 0;
  const ended = new Promise((res) => { v.onended = res; });
  const sample = (now, meta) => {
    x.drawImage(v, 0, 0, 32, 18);
    const d = x.getImageData(0, 0, 32, 18).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    const black = sum / (d.length / 4 * 3) < 8;
    const t = meta.mediaTime;
    if (black) { if (blackStart === null) blackStart = t; longest = Math.max(longest, t - blackStart); } else blackStart = null;
    last = t;
    if (!v.ended) v.requestVideoFrameCallback(sample);
  };
  v.requestVideoFrameCallback(sample);
  await v.play();
  await ended;
  return longest;
}, { b64: bytes.toString("base64"), mime });

test.describe("combine selected clips", () => {
  /** Record `n` clips with sound, each ~2.5 s, through the real pipeline. */
  async function recordClips(page, n) {
    await startCamera(page);
    for (let i = 1; i <= n; i++) {
      await waitCam(page, "recording");
      await page.waitForTimeout(2600);
      await ev(page, `${CAM}.motion.isMotion = () => false`);
      await ev(page, `${CAM}.recorder.stopRecording(false)`);
      await expect.poll(() => clips(page).then((c) => c.length)).toBe(i);
      await ev(page, `delete ${CAM}.motion.isMotion`);
    }
    await ev(page, `${CAM}.motion.isMotion = () => false`);   // quiet from here on
  }
  const openCombine = async (page, n) => {
    await openList(page, n);
    await ev(page, `${LIST}.querySelector('.select-all-btn').click()`);
    await ev(page, `${LIST}.querySelector('.merge-btn').click()`);
    expect(await ev(page, `!!${LIST}.querySelector('[role=dialog] .tl-on')`)).toBe(true);
  };
  const start = (page) => ev(page, `${LIST}.querySelector('.start').click()`);

  test("needs at least two selected clips", async ({ page }) => {
    await open(page);
    await recordClips(page, 1);
    await openList(page, 1);
    expect(await ev(page, `${LIST}.querySelector('.merge-btn').disabled`)).toBe(true);
    await ev(page, `${LIST}.querySelector('.select-all-btn').click()`);
    expect(await ev(page, `${LIST}.querySelector('.merge-btn').disabled`), "one clip is not enough").toBe(true);
  });

  test("without timelapse: one video with sound, as long as the clips together", async ({ page, errors }) => {
    test.setTimeout(120_000);
    await open(page, "audio=1");
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);

    await openCombine(page, 2);
    expect(await ev(page, `${LIST}.querySelector('.total').textContent`)).toMatch(/^Total length \d+:\d{2}$/);
    expect(await ev(page, `${LIST}.querySelector('.tl-opts').hidden`), "timelapse options start hidden").toBe(true);

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await start(page);
    expect(await ev(page, `!!${LIST}.querySelector('[role=dialog] [role=progressbar]')`)).toBe(true);
    await expect.poll(() => ev(page, `${LIST}.querySelector('.phase')?.textContent`)).toMatch(/Clip \d of 2/);
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^motionwatch-combined-\d+\.(mp4|webm)$/);
    expect(await ev(page, `!${LIST}.querySelector('[role=dialog]')`), "dialog closed").toBe(true);

    const bytes = fs.readFileSync(await d.path());
    expect(bytes.length).toBeGreaterThan(5_000);
    const audio = await page.evaluate(async (b64) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const a = await new AudioContext().decodeAudioData(arr.buffer);
      const ch = a.getChannelData(0); let sum = 0; for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      return { duration: a.duration, rms: Math.sqrt(sum / ch.length) };
    }, bytes.toString("base64"));
    expect(audio.duration).toBeGreaterThan(total - 1.5);
    expect(audio.duration).toBeLessThan(total + 2.5);
    expect(audio.rms, "the combined video has audible sound").toBeGreaterThan(0.005);
    expect(errors).toEqual([]);
  });

  test("with a timelapse by speed-up: a ZIP with both files, the timelapse is that much shorter and silent", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, "audio=1");
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);

    await openCombine(page, 2);
    await ev(page, `(() => { const c = ${LIST}.querySelector('.tl-on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    expect(await ev(page, `${LIST}.querySelector('.tl-opts').hidden`)).toBe(false);
    await ev(page, `(() => { const s = ${LIST}.querySelector('#tl-speed'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    expect(await ev(page, `${LIST}.querySelector('.tl-summary').textContent`)).toMatch(/×4/);

    const download = page.waitForEvent("download", { timeout: 90_000 });
    await start(page);
    await expect.poll(() => ev(page, `${LIST}.querySelector('.phase')?.textContent`)).toMatch(/Step 1 of 2/);
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^motionwatch-combined-\d+\.zip$/);

    const files = unzipStored(fs.readFileSync(await d.path()));
    const names = Object.keys(files).sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^motionwatch-combined-\d+\.(mp4|webm)$/);
    expect(names[1]).toMatch(/^motionwatch-timelapse-\d+\.(mp4|webm)$/);
    const mime = (n) => (n.endsWith(".mp4") ? "video/mp4" : "video/webm");

    const full = await mediaDuration(page, files[names[0]], mime(names[0]));
    const fast = await mediaDuration(page, files[names[1]], mime(names[1]));
    expect(full).toBeGreaterThan(total - 1.5);
    expect(full).toBeLessThan(total + 2.5);
    expect(fast, "×4 timelapse is about a quarter as long").toBeGreaterThan(total / 4 - 1);
    expect(fast).toBeLessThan(total / 4 + 1.5);
    const audioTracks = await page.evaluate(async ({ b64 }) => {
      const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      try { await new AudioContext().decodeAudioData(arr.buffer); return true; } catch { return false; }
    }, { b64: files[names[1]].toString("base64") });
    expect(audioTracks, "the timelapse has no sound track").toBe(false);
  });

  test("a black gap (default 0.3 s) separates the clips in the combined video, but not in the timelapse", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);

    await openCombine(page, 2);
    expect(await ev(page, `${LIST}.querySelector('#gap-in').value`), "default gap").toBe("0.3");
    const gap = 2;                                           // long enough to measure reliably
    await ev(page, `(() => { const i = ${LIST}.querySelector('#gap-in'); i.value = '${gap}'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    expect(await ev(page, `${LIST}.querySelector('.total').textContent`)).toMatch(/^Total length \d+:\d{2}$/);
    await ev(page, `(() => { const c = ${LIST}.querySelector('.tl-on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await ev(page, `(() => { const s = ${LIST}.querySelector('#tl-speed'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

    const download = page.waitForEvent("download", { timeout: 120_000 });
    await start(page);
    const files = unzipStored(fs.readFileSync(await (await download).path()));
    const names = Object.keys(files).sort();
    const mime = (n) => (n.endsWith(".mp4") ? "video/mp4" : "video/webm");
    const full = await mediaDuration(page, files[names[0]], mime(names[0]));
    const fast = await mediaDuration(page, files[names[1]], mime(names[1]));
    expect(full, "combined = clips + gap").toBeGreaterThan(total + gap - 1.2);
    expect(full).toBeLessThan(total + gap + 2.5);
    expect(fast, "the timelapse has no gap").toBeLessThan(total / 4 + 1.5);

    const blackFull = await longestBlackRun(page, files[names[0]], mime(names[0]));
    expect(blackFull, "about 2 s of black frames in the combined video").toBeGreaterThan(gap - 0.8);
    expect(blackFull).toBeLessThan(gap + 0.8);
    const blackFast = await longestBlackRun(page, files[names[1]], mime(names[1]));
    expect(blackFast, "no black stretch in the timelapse").toBeLessThan(0.5);
  });

  test("a gap of 0 gives a seamless combined video", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page);
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);
    await openCombine(page, 2);
    await ev(page, `(() => { const i = ${LIST}.querySelector('#gap-in'); i.value = '0'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const download = page.waitForEvent("download", { timeout: 90_000 });
    await start(page);
    const d = await download;
    const bytes = fs.readFileSync(await d.path());
    const dur = await mediaDuration(page, bytes, d.suggestedFilename().endsWith(".mp4") ? "video/mp4" : "video/webm");
    expect(dur).toBeGreaterThan(total - 1.2);
    expect(dur).toBeLessThan(total + 1.0);
  });

  test("the outputs are chosen with two switches; one output is downloaded as is, two as a ZIP", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);
    const flip = (cls, on) => ev(page, `(() => { const c = ${LIST}.querySelector('${cls}'); c.checked = ${on}; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);

    await openCombine(page, 2);
    expect(await ev(page, `${LIST}.querySelector('.main-on').checked`), "combined video is on by default").toBe(true);
    expect(await ev(page, `${LIST}.querySelector('.tl-on').checked`), "timelapse is off by default").toBe(false);
    expect(await ev(page, `${LIST}.querySelector('.main-label').textContent`)).toBe("Combined video");
    expect(await ev(page, `${LIST}.querySelector('.tl-label').textContent`)).toBe("Timelapse");

    // neither: nothing to make
    await flip(".main-on", false);
    expect(await ev(page, `${LIST}.querySelector('.start').disabled`)).toBe(true);
    expect(await ev(page, `${LIST}.querySelector('.need-one').hidden`)).toBe(false);
    expect(await ev(page, `${LIST}.querySelector('.gap-field').hidden`), "the gap belongs to the combined video only").toBe(true);

    // timelapse only: a single file, no ZIP
    await flip(".tl-on", true);
    expect(await ev(page, `${LIST}.querySelector('.start').disabled`)).toBe(false);
    expect(await ev(page, `${LIST}.querySelector('.need-one').hidden`)).toBe(true);
    await ev(page, `(() => { const s = ${LIST}.querySelector('#tl-speed'); s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const download = page.waitForEvent("download", { timeout: 90_000 });
    await start(page);
    await expect.poll(() => ev(page, `${LIST}.querySelector('.phase')?.textContent`)).not.toMatch(/Step/);   // one step only
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^motionwatch-timelapse-\d+\.(mp4|webm)$/);
    const bytes = fs.readFileSync(await d.path());
    expect(bytes.subarray(0, 2).toString(), "not a ZIP").not.toBe("PK");
    const dur = await mediaDuration(page, bytes, d.suggestedFilename().endsWith(".mp4") ? "video/mp4" : "video/webm");
    expect(dur).toBeLessThan(total / 4 + 1.5);
    expect(dur).toBeGreaterThan(total / 4 - 1);
  });

  test("a timelapse can be sized by target length", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page);
    await recordClips(page, 2);
    const total = (await clips(page)).reduce((s, c) => s + c.durationSec, 0);

    await openCombine(page, 2);
    await ev(page, `(() => { const c = ${LIST}.querySelector('.tl-on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await ev(page, `(() => { const r = [...${LIST}.querySelectorAll('input[name=tlmode]')].find((i) => i.value === 'length'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    expect(await ev(page, `${LIST}.querySelector('.tl-length').hidden`)).toBe(false);
    expect(await ev(page, `${LIST}.querySelector('.tl-speed').hidden`)).toBe(true);
    const target = 2;
    await ev(page, `(() => { const i = ${LIST}.querySelector('#tl-length'); i.value = '${target}'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const summary = await ev(page, `${LIST}.querySelector('.tl-summary').textContent`);
    expect(summary).toMatch(/×\d+(\.\d)?/);
    expect(summary).toMatch(/about 0:0[1-3]/);

    const download = page.waitForEvent("download", { timeout: 90_000 });
    await start(page);
    const files = unzipStored(fs.readFileSync(await (await download).path()));
    const tlName = Object.keys(files).find((n) => n.includes("timelapse"));
    const fast = await mediaDuration(page, files[tlName], tlName.endsWith(".mp4") ? "video/mp4" : "video/webm");
    expect(fast).toBeGreaterThan(target - 1);
    expect(fast).toBeLessThan(target + 1.5);
    expect(total).toBeGreaterThan(target);
  });

  test("Cancel stops combining and downloads nothing", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await recordClips(page, 2);
    await openCombine(page, 2);
    let downloaded = false;
    page.on("download", () => { downloaded = true; });
    await start(page);
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
    await expect.poll(() => ev(page, `!${LIST}.querySelector('[role=dialog]')`)).toBe(true);
    await page.waitForTimeout(1500);
    expect(downloaded).toBe(false);
  });
});

test.describe("player: previous / next clip", () => {
  async function threeClips(page) {
    await startCamera(page);
    for (let i = 1; i <= 3; i++) {
      await waitCam(page, "recording");
      await page.waitForTimeout(1500);
      await ev(page, `${CAM}.motion.isMotion = () => false`);
      await ev(page, `${CAM}.recorder.stopRecording(false)`);
      await expect.poll(() => clips(page).then((c) => c.length)).toBe(i);
      await ev(page, `delete ${CAM}.motion.isMotion`);
    }
    await ev(page, `${CAM}.motion.isMotion = () => false`);
  }
  const pos = (page) => ev(page, `${LIST}.querySelector('.player .pos').textContent`);
  const title = (page) => ev(page, `${LIST}.querySelector('.player .title').textContent`);

  test("buttons and the arrow keys step through the clips in list order", async ({ page, errors }) => {
    test.setTimeout(90_000);
    await open(page);
    await threeClips(page);
    await openList(page, 3);
    await ev(page, `${LIST}.querySelectorAll('.thumb')[0].click()`);
    await expect.poll(() => pos(page)).toBe("1 / 3");
    const first = await title(page);
    expect(await ev(page, `${LIST}.querySelector('.player .prev').disabled`)).toBe(true);
    expect(await ev(page, `${LIST}.querySelector('.player .next').disabled`)).toBe(false);

    await page.keyboard.press("ArrowRight");
    expect(await pos(page)).toBe("2 / 3");
    expect(await title(page)).not.toBe(first);
    await expect.poll(() => ev(page, `${LIST}.querySelector('.player video').readyState`)).toBeGreaterThanOrEqual(2);

    await ev(page, `${LIST}.querySelector('.player .next').click()`);
    expect(await pos(page)).toBe("3 / 3");
    expect(await ev(page, `${LIST}.querySelector('.player .next').disabled`)).toBe(true);
    await page.keyboard.press("ArrowRight");
    expect(await pos(page), "no wrap-around at the end").toBe("3 / 3");

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect(await pos(page)).toBe("1 / 3");
    expect(await title(page)).toBe(first);
    await ev(page, `${LIST}.querySelector('.player .next').focus()`);
    expect(await ev(page, `${LIST}.querySelector('.player .prev').getAttribute('title')`)).toContain("←");
    await page.keyboard.press("Escape");
    expect(await ev(page, `!${LIST}.querySelector('.player')`)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("starting from a middle clip, Download saves the clip being shown", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await threeClips(page);
    await openList(page, 3);
    await ev(page, `${LIST}.querySelectorAll('.thumb')[1].click()`);
    await expect.poll(() => pos(page)).toBe("2 / 3");
    await page.keyboard.press("ArrowRight");
    const download = page.waitForEvent("download");
    await ev(page, `${LIST}.querySelector('.player .dl').click()`);
    const d = await download;
    const list = await ev(page, `(async () => { const m = await import('./src/services/storage.js'); return (await m.listRecordings()).map((r) => r.createdAt); })()`);
    const stamp = new Date(list[2]).toISOString().replace(/[:.]/g, "-");
    expect(d.suggestedFilename()).toContain(stamp);
  });
});

test.describe("MP4 format", () => {
  test("clips are saved as .mp4 whenever this browser can record MP4", async ({ page }) => {
    await open(page);
    const canMp4 = await page.evaluate(() => MediaRecorder.isTypeSupported("video/mp4"));
    await makeClip(page);
    const [c] = await clips(page);
    expect(c.mime.includes("mp4")).toBe(canMp4);
    await openList(page);
    const download = page.waitForEvent("download");
    await ev(page, `${LIST}.querySelector('.card .actions button').click()`);
    expect((await download).suggestedFilename()).toMatch(canMp4 ? /\.mp4$/ : /\.webm$/);
    await selectTab(page, "settings");
    expect(await ev(page, `${APP}.querySelector('motion-settings').shadowRoot.querySelector('.format-val').textContent`)).toBe(canMp4 ? "MP4" : "WebM");
  });
});
