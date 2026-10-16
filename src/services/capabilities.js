/**
 * Runtime capability detection for Safari / WebKit / Chromium differences.
 */

export function isSecureContext() {
  return window.isSecureContext === true;
}

export function hasGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function hasMediaRecorder() {
  return typeof MediaRecorder !== "undefined";
}

export function hasCaptureStream() {
  // HTMLCanvasElement.prototype.captureStream
  return typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export function hasWakeLock() {
  return !!(navigator.wakeLock && navigator.wakeLock.request);
}

export function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

/**
 * Ordered MediaRecorder MIME candidates. MP4 comes first (clips are saved as .mp4 wherever the
 * browser can record it: Safari, Chrome, recent Chromium); WebM is the fallback (e.g. Firefox).
 * @param {boolean} [withAudio] put candidates that explicitly cover an audio track first within each container
 * @returns {string[]}
 */
export function getSupportedMimeTypes(withAudio = false) {
  if (!hasMediaRecorder()) return [];
  const mp4 = [
    ...(withAudio ? ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2"] : []),
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4;codecs=avc1", // H.264
    "video/mp4",             // whatever codec the browser picks, still an MP4 file
  ];
  const webm = [
    ...(withAudio ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"] : []),
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/x-matroska;codecs=avc1",
  ];
  return [...mp4, ...webm].filter((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

export function pickBestMimeType(withAudio = false) {
  const supported = getSupportedMimeTypes(withAudio);
  return supported[0] || "";
}

/** What clips will be saved as in this browser. */
export function recordingFormat(withAudio = false) {
  const mime = pickBestMimeType(withAudio);
  const extension = extensionForMime(mime);
  return { mime, extension, mp4: extension === "mp4" };
}

export function extensionForMime(mime) {
  if (!mime) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("matroska")) return "mkv";
  return "webm";
}

/**
 * Quality presets → ideal constraints
 */
export function constraintsForQuality(quality) {
  switch (quality) {
    case "low":
      return { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } };
    case "high":
      return { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    case "medium":
    default:
      return { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } };
  }
}

export function fullCapabilityReport() {
  return {
    secureContext: isSecureContext(),
    getUserMedia: hasGetUserMedia(),
    mediaRecorder: hasMediaRecorder(),
    captureStream: hasCaptureStream(),
    wakeLock: hasWakeLock(),
    indexedDB: hasIndexedDB(),
    mimeTypes: getSupportedMimeTypes(),
    bestMime: pickBestMimeType(),
  };
}
