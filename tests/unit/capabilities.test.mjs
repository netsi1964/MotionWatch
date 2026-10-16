import test from "node:test";
import assert from "node:assert/strict";

/** Import capabilities.js with a fake MediaRecorder that supports exactly the given types. */
let n = 0;
async function withTypes(types) {
  globalThis.MediaRecorder = class { static isTypeSupported(t) { return types.includes(t); } };
  return import(`../../src/services/capabilities.js?case=${n++}`);
}

test("MP4 is preferred whenever the browser can record it", async () => {
  const m = await withTypes(["video/webm;codecs=vp9", "video/webm", "video/mp4"]);
  assert.equal(m.pickBestMimeType(), "video/mp4");
  assert.equal(m.recordingFormat().extension, "mp4");
  assert.equal(m.recordingFormat().mp4, true);
});

test("H.264 MP4 beats generic MP4, which beats WebM", async () => {
  const m = await withTypes(["video/webm;codecs=vp9", "video/mp4", "video/mp4;codecs=avc1", "video/mp4;codecs=avc1.42E01E"]);
  assert.deepEqual(m.getSupportedMimeTypes().slice(0, 3), ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"]);
});

test("with audio the AAC-capable MP4 type comes first", async () => {
  const m = await withTypes(["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus"]);
  assert.equal(m.pickBestMimeType(true), "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  assert.equal(m.pickBestMimeType(false), "video/mp4;codecs=avc1");
});

test("browsers without MP4 recording (Firefox) fall back to WebM", async () => {
  const m = await withTypes(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
  assert.equal(m.pickBestMimeType(), "video/webm;codecs=vp9");
  assert.equal(m.recordingFormat().extension, "webm");
  assert.equal(m.recordingFormat().mp4, false);
});

test("no MediaRecorder at all", async () => {
  delete globalThis.MediaRecorder;
  const m = await import(`../../src/services/capabilities.js?case=${n++}`);
  assert.deepEqual(m.getSupportedMimeTypes(), []);
  assert.equal(m.pickBestMimeType(), "");
});

test("file extensions follow the MIME type", async () => {
  const m = await withTypes([]);
  assert.equal(m.extensionForMime("video/mp4;codecs=avc1"), "mp4");
  assert.equal(m.extensionForMime("video/webm;codecs=vp9,opus"), "webm");
  assert.equal(m.extensionForMime("video/x-matroska"), "mkv");
  assert.equal(m.extensionForMime(""), "webm");
});
