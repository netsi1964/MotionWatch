import { pickBestMimeType, extensionForMime } from "./capabilities.js";

/**
 * Combine several stored clips into one video, entirely in the browser.
 *
 * Browsers cannot splice MediaRecorder files directly, so the clips are played one after
 * another into a canvas (and a Web Audio destination for the sound) that a MediaRecorder
 * records. It therefore takes about as long as the clips themselves, and the tab has to
 * stay visible while it runs.
 *
 * @param {import("./storage.js").RecordingMeta[]} clips  chronological order
 * @param {object} [opts]
 * @param {number} [opts.speed=1]  1 = normal; >1 = timelapse (silent, played back this many times faster, max 16)
 * @param {number} [opts.gapSec=0] black, silent gap between clips in seconds (ignored for timelapse; max 5)
 * @param {(p: { done: number, total: number, index: number, count: number }) => void} [opts.onProgress] source seconds
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ blob: Blob, mimeType: string, extension: string, durationSec: number }>}
 */
export const MAX_SPEED = 16;

export async function concatClips(clips, { onProgress, signal, speed = 1, gapSec = 0 } = {}) {
  if (!clips.length) throw new Error("No clips");
  speed = Math.min(MAX_SPEED, Math.max(1, speed));
  const timelapse = speed > 1;
  const hasAudio = !timelapse && clips.some((c) => c.hasAudio);
  const width = Math.max(...clips.map((c) => c.width || 0)) || 960;
  const height = Math.max(...clips.map((c) => c.height || 0)) || 540;
  const gap = timelapse ? 0 : Math.min(5, Math.max(0, Number(gapSec) || 0));
  const clipTotal = clips.reduce((s, c) => s + (c.durationSec || 0), 0);
  const total = clipTotal + gap * (clips.length - 1);   // progress is measured in source seconds incl. gaps

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  const stream = canvas.captureStream(30);
  let audioCtx = null;
  let dest = null;
  if (hasAudio) {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    audioCtx = new Ctx();
    await audioCtx.resume().catch(() => {});
    dest = audioCtx.createMediaStreamDestination();
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }

  const mimeType = pickBestMimeType(hasAudio);
  if (!mimeType) throw new Error("No supported video format");
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  } catch {
    recorder = new MediaRecorder(stream);
  }
  const parts = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) parts.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  const urls = [];
  let current = null;
  let raf = 0;
  let frameSource = null;

  /** draw the current clip frame, letterboxed into the output canvas */
  const draw = () => {
    const v = frameSource;
    if (v && v.readyState >= 2 && v.videoWidth) {
      const s = Math.min(width / v.videoWidth, height / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(v, (width - w) / 2, (height - h) / 2, w, h);
    } else if (!frameSource) {
      // between clips: keep painting black so the recorder gets frames for the gap
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
    }
    raf = requestAnimationFrame(draw);
  };

  const cleanup = () => {
    cancelAnimationFrame(raf);
    current?.pause();
    urls.forEach((u) => URL.revokeObjectURL(u));
    stream.getTracks().forEach((t) => t.stop());
    audioCtx?.close().catch(() => {});
  };

  const abort = () => { throw new DOMException("Cancelled", "AbortError"); };

  try {
    recorder.start(500);
    draw();
    let doneSec = 0;
    for (let i = 0; i < clips.length; i++) {
      if (signal?.aborted) abort();
      if (i > 0 && gap > 0) {
        frameSource = null;
        const begin = performance.now();
        await new Promise((res) => {
          const iv = setInterval(() => {
            const el = (performance.now() - begin) / 1000;
            onProgress?.({ done: doneSec + Math.min(gap, el), total, index: i, count: clips.length });
            if (el >= gap || signal?.aborted) { clearInterval(iv); res(); }
          }, 40);
        });
        if (signal?.aborted) abort();
        doneSec += gap;
      }
      const clip = clips[i];
      const v = document.createElement("video");
      v.playsInline = true;
      v.preload = "auto";
      const url = URL.createObjectURL(clip.blob);
      urls.push(url);
      v.src = url;
      await new Promise((res, rej) => {
        v.onloadeddata = res;
        v.onerror = () => rej(new Error("Could not load clip"));
      });
      if (dest && clip.hasAudio) audioCtx.createMediaElementSource(v).connect(dest);
      else v.muted = true;
      v.playbackRate = speed;
      current = v;
      frameSource = v;

      const tick = setInterval(() => onProgress?.({ done: doneSec + Math.min(v.currentTime, clip.durationSec || v.currentTime), total, index: i, count: clips.length }), 200);
      const ended = new Promise((res) => { v.onended = res; });
      const onAbort = () => v.pause();
      signal?.addEventListener("abort", onAbort, { once: true });
      await v.play();
      await Promise.race([ended, new Promise((res) => signal?.addEventListener("abort", res, { once: true }))]);
      clearInterval(tick);
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) abort();
      doneSec += clip.durationSec || v.currentTime;
      onProgress?.({ done: doneSec, total, index: i, count: clips.length });
    }
    // hold the last frame briefly so the recorder flushes it
    await new Promise((r) => setTimeout(r, 250));
    recorder.stop();
    await stopped;
  } catch (err) {
    try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* ignore */ }
    cleanup();
    throw err;
  }
  cleanup();
  const blob = new Blob(parts, { type: recorder.mimeType || mimeType });
  return { blob, mimeType: blob.type, extension: extensionForMime(blob.type), durationSec: clipTotal / speed + gap * (clips.length - 1), speed, gapSec: gap };
}
