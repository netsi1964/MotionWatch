/**
 * Sound-level trigger using Web Audio. The microphone is only analysed (never
 * routed to the speakers): RMS level of the time-domain signal in dBFS.
 */

const DB_MIN = -70; // meter floor
const DB_MAX = -10; // meter ceiling
const SAMPLE_MS = 40;
const SUSTAIN_SAMPLES = 2; // ~80 ms above the threshold: short bangs (clap, door slam) must count

/**
 * One AudioContext for the whole app. Safari (and Chrome's autoplay policy) only lets a context run
 * if it is created/resumed inside a user gesture, so it is unlocked on the first tap or key press
 * and *before* any await on the way to the microphone. A context created later stays "suspended"
 * and silently reads zeros, which looked like a microphone that never picks up anything.
 * @type {AudioContext | null}
 */
let sharedCtx = null;

/** Create the shared AudioContext (once) and try to resume it. Call from a user gesture. */
export function unlockAudio() {
  const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    try { sharedCtx = new Ctx(); } catch { return null; }
  }
  if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

/** "running" | "suspended" | "closed" | "none" */
export function audioState() {
  return sharedCtx ? sharedCtx.state : "none";
}

export class SoundDetector {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {AnalyserNode | null} */
    this.analyser = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.source = null;
    /** @type {Float32Array | null} */
    this.buf = null;
    this.sensitivity = 50;
    /** Current level, dBFS */
    this.db = DB_MIN;
    /** Meter position 0-100 (fast attack, slow release) */
    this.level = 0;
    this._hits = 0;
    this._last = 0;
    /** @type {GainNode | null} */
    this.sink = null;
    /** @type {MediaStreamTrack | null} */
    this.track = null;
    /** True while every sample is exactly 0 (muted, blocked or suspended input) */
    this.flat = false;
    this._bytes = null;
  }

  /** Short description of the input for diagnostics: device label, track and context state. */
  describe() {
    const tr = this.track;
    return {
      label: tr?.label || "",
      muted: !!tr?.muted,
      ended: tr?.readyState === "ended",
      state: this.ctx?.state || "none",
    };
  }

  get active() {
    return !!this.analyser;
  }

  /** The browser is holding the audio context back until the user taps something. */
  get blocked() {
    return !!this.analyser && this.ctx?.state === "suspended";
  }

  setSensitivity(v) {
    this.sensitivity = Math.max(0, Math.min(100, v));
  }

  /** Trigger threshold in dBFS: -20 dB at sensitivity 0 … -60 dB at 100 (-40 at the default 50). */
  thresholdDb() {
    return -20 - (this.sensitivity / 100) * 40;
  }

  /** Threshold as meter position 0-100 */
  thresholdLevel() {
    return DB_to_level(this.thresholdDb());
  }

  /** @param {MediaStream} stream @returns {boolean} whether an audio track could be analysed */
  attach(stream) {
    this.detach();
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return false;
    try {
      this.ctx = unlockAudio();
      if (!this.ctx) return false;
      this.source = this.ctx.createMediaStreamSource(new MediaStream(tracks));
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0;
      this.source.connect(this.analyser);
      // Safari (and some Chrome builds) only pull audio through a graph that ends in the destination,
      // otherwise the analyser reads zeros. A gain of 0 keeps the microphone silent in the speakers.
      this.sink = this.ctx.createGain();
      this.sink.gain.value = 0;
      this.analyser.connect(this.sink);
      this.sink.connect(this.ctx.destination);
      this.track = tracks[0];
      this.buf = new Float32Array(this.analyser.fftSize);
      return true;
    } catch {
      this.detach();
      return false;
    }
  }

  detach() {
    try { this.source?.disconnect(); } catch { /* ignore */ }
    try { this.analyser?.disconnect(); } catch { /* ignore */ }
    try { this.sink?.disconnect(); } catch { /* ignore */ }
    this.sink = null;
    this.track = null;
    this.flat = false;
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.buf = null;
    this.db = DB_MIN;
    this.level = 0;
    this._hits = 0;
  }

  /**
   * Take a reading (rate-limited) and report whether the sound trigger is firing.
   * @param {number} now performance.now()
   * @returns {boolean}
   */
  poll(now) {
    if (!this.analyser || !this.buf) return false;
    if (now - this._last < SAMPLE_MS) return this._hits >= SUSTAIN_SAMPLES;
    this._last = now;
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});

    let sum = 0, peak = 0;
    if (this.analyser.getFloatTimeDomainData) {
      this.analyser.getFloatTimeDomainData(/** @type {any} */ (this.buf));
      for (let i = 0; i < this.buf.length; i++) { const v = this.buf[i]; sum += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
    } else {
      // older Safari: 8-bit samples
      if (!this._bytes) this._bytes = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(this._bytes);
      for (let i = 0; i < this._bytes.length; i++) { const v = (this._bytes[i] - 128) / 128; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
      this.buf = new Float32Array(this._bytes.length);
    }
    this.flat = peak === 0;
    const rms = Math.sqrt(sum / this.buf.length);
    this.db = 20 * Math.log10(Math.max(rms, 1e-5));

    const target = DB_to_level(this.db);
    this.level = target > this.level ? target : this.level * 0.85 + target * 0.15;

    if (this.db >= this.thresholdDb()) this._hits++;
    else this._hits = 0;
    return this._hits >= SUSTAIN_SAMPLES;
  }
}

function DB_to_level(db) {
  return Math.max(0, Math.min(100, ((db - DB_MIN) / (DB_MAX - DB_MIN)) * 100));
}
