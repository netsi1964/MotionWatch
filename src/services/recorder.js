import { pickBestMimeType, extensionForMime, constraintsForQuality } from "./capabilities.js";
import { t, formatDateTime } from "./i18n.js";

/**
 * Manages camera stream, preview, motion-driven recording with burned-in overlay.
 */
export class RecorderService {
  constructor() {
    /** @type {MediaStream | null} */
    this.stream = null;
    /** @type {HTMLVideoElement | null} */
    this.previewVideo = null;
    /** @type {HTMLCanvasElement | null} */
    this.recordCanvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this.recordCtx = null;
    /** @type {MediaRecorder | null} */
    this.mediaRecorder = null;
    /** @type {MediaStream | null} */
    this.canvasStream = null;
    /** @type {Blob[]} */
    this.chunks = [];
    /** @type {number} */
    this.recordingStart = 0;
    /** @type {string} */
    this.mimeType = "";
    /** @type {boolean} */
    this.isRecording = false;
    /** Put the microphone track into the clips (the track may exist only for sound detection). */
    this.includeAudio = false;
    /** @type {Blob | null} */
    this.posterBlob = null;
    this._posterScore = -1;
    this._posterAt = 0;
    this._posterBusy = false;
    this._clipHasAudio = false;
    /** @type {number | null} */
    this._raf = null;
    /** @type {number | null} */
    this._clockInterval = null;
    /** @type {string} */
    this._clockText = "";
    /** @type {(state: string, detail?: any) => void} */
    this.onStateChange = () => {};
    /** @type {(blob: Blob, meta: object) => void} */
    this.onRecordingComplete = () => {};
    /** @type {(err: Error) => void} */
    this.onError = () => {};
  }

  /**
   * @param {HTMLVideoElement} videoEl
   */
  attachPreview(videoEl) {
    this.previewVideo = videoEl;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.deviceId]
   * @param {'low'|'medium'|'high'} [opts.quality]
   * @param {boolean} [opts.audio] also capture the microphone (falls back to video only)
   */
  async startCamera(opts = {}) {
    this.stopCamera();
    const quality = opts.quality || "medium";
    const videoConstraints = {
      ...constraintsForQuality(quality),
      facingMode: opts.deviceId ? undefined : { ideal: "environment" },
    };
    if (opts.deviceId) {
      videoConstraints.deviceId = { exact: opts.deviceId };
    }

    /** Set when sound was asked for but the microphone could not be used. */
    this.audioFailed = false;
    const tryGet = (constraints) => navigator.mediaDevices.getUserMedia(constraints);
    const attempts = [{ video: videoConstraints }, { video: true }];
    let lastErr;
    this.stream = null;
    for (const base of attempts) {
      if (opts.audio) {
        try {
          this.stream = await tryGet({ ...base, audio: true });
          break;
        } catch (err) {
          lastErr = err;
          // permission for the camera may have been fine: retry without sound first
          try {
            this.stream = await tryGet({ ...base, audio: false });
            this.audioFailed = true;
            break;
          } catch (err2) {
            lastErr = err2;
          }
        }
      } else {
        try {
          this.stream = await tryGet({ ...base, audio: false });
          break;
        } catch (err) {
          lastErr = err;
        }
      }
    }
    if (!this.stream) {
      this.onError(lastErr instanceof Error ? lastErr : new Error(String(lastErr)));
      throw lastErr;
    }
    this.hasAudio = this.stream.getAudioTracks().length > 0;

    const v = this.previewVideo;
    if (v) {
      // Safari: the element must be muted + inline *before* a MediaStream is attached and
      // played (the `muted` attribute is not applied to template-cloned elements).
      v.muted = true;
      v.defaultMuted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      v.setAttribute("autoplay", "");
      v.srcObject = this.stream;
      try {
        await v.play();
      } catch {
        // Autoplay was blocked; the UI offers a tap-to-start fallback
      }
    }

    this._ensureRecordCanvas();
    this._startCompositeLoop();
    this._startClock();
    return this.stream;
  }

  stopCamera() {
    this.stopRecording(true);
    this._stopCompositeLoop();
    this._stopClock();
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.previewVideo) {
      this.previewVideo.srcObject = null;
    }
    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((t) => t.stop());
      this.canvasStream = null;
    }
  }

  _ensureRecordCanvas() {
    if (!this.recordCanvas) {
      this.recordCanvas = document.createElement("canvas");
      this.recordCtx = this.recordCanvas.getContext("2d", { alpha: false });
    }
    const v = this.previewVideo;
    if (v && v.videoWidth) {
      this.recordCanvas.width = v.videoWidth;
      this.recordCanvas.height = v.videoHeight;
    } else {
      this.recordCanvas.width = 960;
      this.recordCanvas.height = 540;
    }
  }

  _startClock() {
    this._stopClock();
    const tick = () => {
      this._clockText = formatDateTime(new Date());
    };
    tick();
    this._clockInterval = window.setInterval(tick, 1000);
  }

  _stopClock() {
    if (this._clockInterval != null) {
      clearInterval(this._clockInterval);
      this._clockInterval = null;
    }
  }

  _startCompositeLoop() {
    this._stopCompositeLoop();
    const draw = () => {
      this._drawFrame();
      this._raf = requestAnimationFrame(draw);
    };
    this._raf = requestAnimationFrame(draw);
  }

  _stopCompositeLoop() {
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _drawFrame() {
    const v = this.previewVideo;
    const canvas = this.recordCanvas;
    const ctx = this.recordCtx;
    if (!v || !canvas || !ctx || v.readyState < 2) return;

    if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
      if (v.videoWidth > 0) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
      }
    }

    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    // Burn-in overlay: timestamp only
    const pad = Math.max(8, Math.round(canvas.width * 0.015));
    const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
    ctx.save();
    ctx.font = `bold ${fontSize}px ui-monospace, monospace`;
    ctx.textBaseline = "top";

    // Timestamp bottom-right
    const clock = this._clockText || formatDateTime(new Date());
    const clockW = ctx.measureText(clock).width + pad * 2;
    const clockH = fontSize + pad;
    const cx = canvas.width - clockW - pad;
    const cy = canvas.height - clockH - pad;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(cx, cy, clockW, clockH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(clock, cx + pad, cy + pad * 0.35);
    ctx.restore();
  }

  /**
   * Start MediaRecorder from the composite canvas stream.
   */
  startRecording() {
    if (this.isRecording || !this.recordCanvas) return;

    const audioForClip = this.includeAudio ? this.stream?.getAudioTracks() || [] : [];
    this._clipHasAudio = audioForClip.length > 0;
    this.mimeType = pickBestMimeType(this._clipHasAudio);
    if (!this.mimeType) {
      this.onError(new Error(t("errorCodec")));
      return;
    }

    // Capture stream from canvas (includes overlay)
    try {
      this.canvasStream = this.recordCanvas.captureStream(30);
    } catch (err) {
      this.onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    this.chunks = [];
    // Canvas video + microphone track (if any) go into one stream
    const audioTracks = this.includeAudio ? this.stream?.getAudioTracks() || [] : [];
    const source = audioTracks.length
      ? new MediaStream([...this.canvasStream.getVideoTracks(), ...audioTracks])
      : this.canvasStream;
    try {
      this.mediaRecorder = new MediaRecorder(source, {
        mimeType: this.mimeType,
        videoBitsPerSecond: 2_500_000,
      });
    } catch {
      try {
        this.mediaRecorder = new MediaRecorder(source);
        this.mimeType = this.mediaRecorder.mimeType || this.mimeType;
      } catch (err2) {
        this.onError(err2 instanceof Error ? err2 : new Error(String(err2)));
        return;
      }
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onerror = () => {
      this.onError(new Error(t("errorRecording")));
    };

    this.mediaRecorder.onstop = () => {
      this._finalizeRecording();
    };

    this.recordingStart = performance.now();
    this.posterBlob = null;
    this._posterScore = -1;
    this._posterAt = 0;
    this.isRecording = true;
    this.mediaRecorder.start(250); // timeslice for more reliable chunks
    this.onStateChange("recording");
  }

  /**
   * Keep the frame with the most activity as the clip preview image.
   * Called every analysis tick while recording; captures at most every ~600 ms.
   * @param {number} score motion/sound score 0-100
   */
  offerPoster(score) {
    if (!this.isRecording || this._posterBusy || !this.recordCanvas) return;
    const now = performance.now();
    const first = this._posterScore < 0 && now - this.recordingStart > 350;
    if (!first && !(score > this._posterScore + 5 && now - this._posterAt > 600)) return;
    this._posterAt = now;
    this._posterScore = Math.max(score, 0);
    this._capturePoster();
  }

  _capturePoster() {
    const src = this.recordCanvas;
    if (!src || !src.width) return;
    this._posterBusy = true;
    const w = Math.min(640, src.width);
    const h = Math.round((src.height / src.width) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(src, 0, 0, w, h);
    c.toBlob((blob) => {
      if (blob) this.posterBlob = blob;
      this._posterBusy = false;
    }, "image/jpeg", 0.8);
  }

  /**
   * @param {boolean} [discard=false]
   */
  stopRecording(discard = false) {
    if (!this.isRecording || !this.mediaRecorder) {
      this.isRecording = false;
      return;
    }
    if (discard) {
      this.mediaRecorder.onstop = null;
      try {
        if (this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
      } catch { /* ignore */ }
      this.chunks = [];
      this.isRecording = false;
      this.onStateChange("monitoring");
      return;
    }
    try {
      if (this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
    } catch {
      this.isRecording = false;
    }
  }

  _finalizeRecording() {
    this.isRecording = false;
    const durationSec = (performance.now() - this.recordingStart) / 1000;
    const blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
    this.chunks = [];

    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((t) => t.stop());
      this.canvasStream = null;
    }
    this.mediaRecorder = null;

    // Minimum useful length ~1s
    if (durationSec < 0.8 || blob.size < 1000) {
      this.onStateChange("monitoring");
      return;
    }

    this.onStateChange("saving");
    this.onRecordingComplete(blob, {
      durationSec,
      mimeType: blob.type || this.mimeType,
      width: this.recordCanvas?.width,
      height: this.recordCanvas?.height,
      poster: this.posterBlob,
      hasAudio: this._clipHasAudio,
      extension: extensionForMime(blob.type || this.mimeType),
    });
  }

  /** List available video input devices */
  static async listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput");
    } catch {
      return [];
    }
  }
}
