/**
 * Frame-differencing motion detector.
 *
 * Primary path runs on the GPU as WebGL fragment shaders (GLSL):
 *   1. luma pass   – video frame -> 160x90 grayscale texture (4x4 box filter)
 *   2. reduce pass – |current - previous| per texel, noise-gated, summed per
 *                    16x16 block into a 10x6 band; one band per detection area
 *                    (area membership is a bit mask in the mask texture)
 *   Only those 60 pixels per area are read back to the CPU, never the full frame.
 * If WebGL is unavailable or the context is lost, it falls back to the
 * original canvas-2D + CPU loop. Both paths feed the same scoring function.
 */

import { ellipsePoints, MAX_AREAS } from "./areas.js";

const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 90;
const BLOCK = 16;
const AREA_MIN_PIXELS = 16;
const BLOCKS_X = Math.ceil(ANALYSIS_WIDTH / BLOCK); // 10
const BLOCKS_Y = Math.ceil(ANALYSIS_HEIGHT / BLOCK); // 6
/** Per-pixel differences below this (0-255) are treated as sensor noise. */
const NOISE_FLOOR = 20;
/** Compare frames roughly this far apart; per-video-frame diffs of slow motion are too small. */
const MIN_INTERVAL_MS = 120;
/** Score (0-100) at which motion is declared; the meter marks this point. */
export const MOTION_THRESHOLD = 50;

const VERTEX_SRC = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

const LUMA_SRC = `${PRECISION}
uniform sampler2D tex;
uniform vec2 texel; // size of one analysis pixel in uv space
varying vec2 uv;
void main() {
  vec3 c = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = ((vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5) * texel;
      c += texture2D(tex, uv + o).rgb;
    }
  }
  c /= 16.0;
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(y, y, y, 1.0);
}`;

const REDUCE_SRC = `${PRECISION}
uniform sampler2D cur;
uniform sampler2D prev;
uniform sampler2D mask;  // area membership as bits: R = areas 0-7, G = areas 8-11
uniform vec4 region;     // bounding box of this area in analysis pixels: x0, y0, x1, y1 (exclusive)
uniform vec2 sel;        // x: channel (0 = R, 1 = G), y: 2^bit of this area
uniform float yoff;      // first row of this area's band in the output
void main() {
  vec2 base = floor(gl_FragCoord.xy - vec2(0.0, yoff)) * ${BLOCK}.0;
  float acc = 0.0;
  for (int y = 0; y < ${BLOCK}; y++) {
    for (int x = 0; x < ${BLOCK}; x++) {
      vec2 tc = base + vec2(float(x), float(y));
      if (tc.x >= region.x && tc.y >= region.y && tc.x < region.z && tc.y < region.w) {
        vec2 uv = (tc + 0.5) / vec2(${ANALYSIS_WIDTH}.0, ${ANALYSIS_HEIGHT}.0);
        vec4 m = texture2D(mask, uv);
        float bits = (sel.x < 0.5 ? m.r : m.g) * 255.0;
        if (mod(floor(bits / sel.y + 0.01), 2.0) > 0.5) {
          float d = abs(texture2D(cur, uv).r - texture2D(prev, uv).r);
          if (d * 255.0 > ${NOISE_FLOOR}.0) acc += 1.0;
        }
      }
    }
  }
  // fraction of changed texels in the block (0..1), packed over two 8-bit channels
  float s = min(acc / ${BLOCK * BLOCK}.0, 1.0) * 255.0;
  gl_FragColor = vec4(floor(s) / 255.0, fract(s), 0.0, 1.0);
}`;

/** GPU backend. Throws from the constructor when WebGL cannot be used. */
class GpuDiff {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = ANALYSIS_WIDTH;
    this.canvas.height = ANALYSIS_HEIGHT;
    this.lost = false;
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });

    const gl = this.canvas.getContext("webgl", {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;

    this.lumaProg = this._program(VERTEX_SRC, LUMA_SRC);
    this.reduceProg = this._program(VERTEX_SRC, REDUCE_SRC);

    // Fullscreen triangle strip shared by both passes
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const prog of [this.lumaProg, this.reduceProg]) {
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    this.videoTex = this._texture(null, 1, 1, gl.LINEAR);
    // Ping-pong luma targets: [current, previous] swap every frame
    this.luma = [
      this._target(ANALYSIS_WIDTH, ANALYSIS_HEIGHT),
      this._target(ANALYSIS_WIDTH, ANALYSIS_HEIGHT),
    ];
    this.reduce = this._target(BLOCKS_X, BLOCKS_Y * MAX_AREAS);
    this.maskTex = this._texture(null, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, gl.NEAREST);
    this.pixels = new Uint8Array(BLOCKS_X * BLOCKS_Y * MAX_AREAS * 4);
    this.cur = 0;
    this.hasPrev = false;

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer incomplete");
    }
  }

  _program(vs, fs) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || "Shader compile failed");
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || "Program link failed");
    }
    return prog;
  }

  _texture(_unused, w, h, filter) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = this._texture(null, w, h, gl.NEAREST);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  /** @param {Uint8Array[]} masks one byte per analysis pixel and area, 1 = inside that area */
  setMasks(masks) {
    const gl = this.gl;
    const n = ANALYSIS_WIDTH * ANALYSIS_HEIGHT;
    const rgba = new Uint8Array(n * 4);
    for (let k = 0; k < Math.min(masks.length, MAX_AREAS); k++) {
      const m = masks[k];
      const ch = k < 8 ? 0 : 1, bit = 1 << (k % 8);
      for (let i = 0; i < n; i++) if (m[i]) rgba[i * 4 + ch] |= bit;
    }
    for (let i = 0; i < n; i++) rgba[i * 4 + 3] = 255;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ANALYSIS_WIDTH, ANALYSIS_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {{x0:number,y0:number,x1:number,y1:number,count:number}[]} entries one per detection area
   * @returns {number[] | null} per area: fraction (0-1) of its pixels that changed, or null on the first frame
   */
  avgDiff(video, entries) {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) throw new Error("WebGL context lost");

    // Upload the current video frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Pass 1: luma into the current target
    const cur = this.luma[this.cur];
    const prev = this.luma[1 - this.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fbo);
    gl.viewport(0, 0, cur.w, cur.h);
    gl.useProgram(this.lumaProg);
    gl.uniform1i(gl.getUniformLocation(this.lumaProg, "tex"), 0);
    gl.uniform2f(gl.getUniformLocation(this.lumaProg, "texel"), 1 / ANALYSIS_WIDTH, 1 / ANALYSIS_HEIGHT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    let result = null;
    if (this.hasPrev) {
      // Pass 2: one band of block sums per area (thresholded difference of current vs previous)
      const n = Math.min(entries.length, MAX_AREAS);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.reduce.fbo);
      gl.useProgram(this.reduceProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cur.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, prev.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      const u = (name) => gl.getUniformLocation(this.reduceProg, name);
      gl.uniform1i(u("cur"), 0);
      gl.uniform1i(u("prev"), 1);
      gl.uniform1i(u("mask"), 2);
      for (let k = 0; k < n; k++) {
        const e = entries[k];
        gl.viewport(0, k * BLOCKS_Y, BLOCKS_X, BLOCKS_Y);
        gl.uniform4f(u("region"), e.x0, e.y0, e.x1, e.y1);
        gl.uniform2f(u("sel"), k < 8 ? 0 : 1, 2 ** (k % 8));
        gl.uniform1f(u("yoff"), k * BLOCKS_Y);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // Read back only the block sums (the single GPU->CPU sync point)
      gl.readPixels(0, 0, BLOCKS_X, BLOCKS_Y * n, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
      result = [];
      for (let k = 0; k < n; k++) {
        let sum = 0;
        const start = k * BLOCKS_X * BLOCKS_Y * 4;
        for (let i = start; i < start + BLOCKS_X * BLOCKS_Y * 4; i += 4) sum += (this.pixels[i] + this.pixels[i + 1] / 255) / 255;
        // sum = Σ (changed texels / block size): undo that, divide by the area size
        result.push((sum * BLOCK * BLOCK) / entries[k].count);
      }
    }

    gl.activeTexture(gl.TEXTURE0);
    this.cur = 1 - this.cur;
    this.hasPrev = true;
    return result;
  }

  reset() {
    this.hasPrev = false;
  }

  dispose() {
    const gl = this.gl;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas = null;
  }
}

export class MotionDetector {
  /**
   * @param {object} opts
   * @param {number} [opts.sensitivity=40] 0-100
   * @param {boolean} [opts.preferGpu=true]
   */
  constructor(opts = {}) {
    this.sensitivity = opts.sensitivity ?? 40;
    this.preferGpu = opts.preferGpu ?? true;
    /** @type {"gpu" | "cpu"} */
    this.backend = "cpu";
    /** @type {GpuDiff | null} */
    this._gpu = null;
    this._gpuTried = false;
    this._prev = null;
    /** @type {HTMLCanvasElement | null} */
    this._canvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this._ctx = null;
    this._lastScore = 0;
    /** Last fraction (0-1) of changed pixels, useful for debugging/tests */
    this.lastChanged = 0;
    this.minIntervalMs = opts.minIntervalMs ?? MIN_INTERVAL_MS;
    this._lastRun = 0;
    /**
     * One entry per detection area: its mask (1 byte per analysis pixel), bounding box, pixel count and own
     * sensitivity (null = the global one). Without areas a single whole-frame entry (id null).
     * @type {{ id: string | null, name: string, sens: number | null, mask: Uint8Array, x0: number, y0: number, x1: number, y1: number, count: number }[]}
     */
    this._entries = [this._wholeFrame()];
    this._lastScores = [];
    /** ids of the areas currently at or above the trigger point */
    this.hot = [];
    /** per area: smoothed score 0-100 */
    this.areaScores = [];
    this._areasKey = "[]";
    /** @type {(backend: "gpu" | "cpu") => void | null} */
    this.onBackendChange = null;
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(0, Math.min(100, value));
  }

  _wholeFrame() {
    return {
      id: null, name: "", sens: null, mask: new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT).fill(1),
      x0: 0, y0: 0, x1: ANALYSIS_WIDTH, y1: ANALYSIS_HEIGHT, count: ANALYSIS_WIDTH * ANALYSIS_HEIGHT,
    };
  }

  /** Pixels covered by the detection areas together (the whole frame when there are none). */
  get unionCount() {
    const union = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    for (const e of this._entries) for (let i = 0; i < union.length; i++) if (e.mask[i]) union[i] = 1;
    return union.reduce((s, v) => s + v, 0);
  }

  /**
   * Restrict detection to the enabled areas (see areas.js); none = whole frame. Every area is
   * judged on its own against its own sensitivity (or the global one), and any of them can trigger.
   * @param {import("./areas.js").Area[]} areas
   */
  setAreas(areas) {
    const active = (areas || []).filter((a) => a.enabled).slice(0, MAX_AREAS);
    const key = JSON.stringify(active);
    if (key === this._areasKey) return;
    this._areasKey = key;

    const entries = [];
    if (active.length) {
      const cv = document.createElement("canvas");
      cv.width = ANALYSIS_WIDTH;
      cv.height = ANALYSIS_HEIGHT;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const sx = ANALYSIS_WIDTH, sy = ANALYSIS_HEIGHT;
      for (const a of active) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        const pts = a.shape === "polygon" ? a.points : a.shape === "ellipse" ? ellipsePoints(a, 48) : null;
        if (pts) {
          pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * sx, p[1] * sy) : ctx.moveTo(p[0] * sx, p[1] * sy)));
          ctx.closePath();
        } else {
          ctx.rect(a.x * sx, a.y * sy, a.w * sx, a.h * sy);
        }
        ctx.fill();
        const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const mask = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
        let count = 0, x0 = ANALYSIS_WIDTH, y0 = ANALYSIS_HEIGHT, x1 = 0, y1 = 0;
        for (let y = 0; y < ANALYSIS_HEIGHT; y++) {
          for (let x = 0; x < ANALYSIS_WIDTH; x++) {
            const i = y * ANALYSIS_WIDTH + x;
            if (px[i * 4] > 127) {
              mask[i] = 1;
              count++;
              if (x < x0) x0 = x;
              if (x + 1 > x1) x1 = x + 1;
              if (y < y0) y0 = y;
              if (y + 1 > y1) y1 = y + 1;
            }
          }
        }
        if (count >= AREA_MIN_PIXELS) entries.push({ id: a.id, name: a.name, sens: a.sensitivity ?? null, mask, x0, y0, x1, y1, count });
      }
    }
    // nothing usable drawn: watch the whole frame
    this._entries = entries.length ? entries : [this._wholeFrame()];
    this._prev = null;
    this._lastScores = [];
    this._gpu?.setMasks(this._entries.map((e) => e.mask));
    this._gpu?.reset();
  }

  /** Choose the backend now instead of on the first analysed frame. */
  init() {
    if (!this._gpuTried) this._initGpu();
  }

  _initGpu() {
    this._gpuTried = true;
    if (!this.preferGpu) return;
    try {
      this._gpu = new GpuDiff();
      this._gpu.setMasks(this._entries.map((e) => e.mask));
      this._setBackend("gpu");
    } catch (err) {
      console.info("[MotionWatch] GPU motion detection unavailable, using CPU:", err?.message || err);
      this._gpu = null;
    }
  }

  _setBackend(b) {
    if (this.backend === b) return;
    this.backend = b;
    this.onBackendChange?.(b);
  }

  _dropGpu(err) {
    console.warn("[MotionWatch] GPU motion detection failed, falling back to CPU:", err?.message || err);
    try { this._gpu?.dispose(); } catch { /* ignore */ }
    this._gpu = null;
    this.preferGpu = false;
    this._prev = null;
    this._setBackend("cpu");
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {number} motion score 0-100
   */
  analyze(video) {
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      this._lastScore = 0;
      return 0;
    }

    // Throttle: compare frames ~120 ms apart so slow movement shows up
    const now = performance.now();
    if (this._lastRun && now - this._lastRun < this.minIntervalMs) return this._lastScore;
    this._lastRun = now;

    if (!this._gpuTried) this._initGpu();

    let changed = null;
    if (this._gpu) {
      try {
        changed = this._gpu.avgDiff(video, this._entries);
      } catch (err) {
        this._dropGpu(err);
        changed = this._cpuAvgDiff(video);
      }
    } else {
      changed = this._cpuAvgDiff(video);
    }

    if (changed == null) {
      this._lastScore = 0;
      return 0;
    }

    // Score 0-100 per area with the trigger point fixed at 50: the share of the area that changed,
    // relative to the minimum share its sensitivity asks for. The strongest area decides.
    let best = 0, bestIdx = 0;
    const hot = [];
    this.areaScores = this._entries.map((e, k) => {
      let score = Math.min(100, (50 * changed[k]) / this.minChangedFraction(e.sens ?? this.sensitivity));
      score = score * 0.7 + (this._lastScores[k] ?? 0) * 0.3; // soften
      this._lastScores[k] = score;
      if (score >= MOTION_THRESHOLD && e.id) hot.push(e.id);
      if (score > best) { best = score; bestIdx = k; }
      return { id: e.id, name: e.name, score };
    });
    this.hot = hot;
    this.lastChanged = changed[bestIdx];
    this._lastScore = best;
    return best;
  }

  /** CPU fallback: canvas 2D downsample + per-pixel loop. Returns one changed-fraction per area. */
  _cpuAvgDiff(video) {
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._canvas.width = ANALYSIS_WIDTH;
      this._canvas.height = ANALYSIS_HEIGHT;
      this._ctx = this._canvas.getContext("2d", { willReadFrequently: true });
    }
    const ctx = this._ctx;
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
    const data = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;

    const gray = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }

    if (!this._prev || this._prev.length !== gray.length) {
      this._prev = gray;
      return null;
    }

    const out = this._entries.map(({ mask, x0, y0, x1, y1, count }) => {
      let diffSum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0, i = y * ANALYSIS_WIDTH + x0; x < x1; x++, i++) {
          if (mask[i] && Math.abs(gray[i] - this._prev[i]) > NOISE_FLOOR) diffSum += 1;
        }
      }
      return diffSum / count;
    });
    this._prev = gray;
    return out;
  }

  /**
   * Whether current score crosses the motion threshold for the given sensitivity.
   * @param {number} score
   */
  isMotion(score = this._lastScore) {
    return score >= MOTION_THRESHOLD;
  }

  /**
   * Smallest share of the detection area that must change to count as motion:
   * 5 % at sensitivity 0, ~1 % at 40 (default), 0.1 % at 100.
   */
  minChangedFraction(sensitivity = this.sensitivity) {
    return 0.05 * Math.pow(0.02, sensitivity / 100);
  }

  reset() {
    this._lastRun = 0;
    this._prev = null;
    this._gpu?.reset();
    this._lastScore = 0;
    this._lastScores = [];
    this.hot = [];
  }

  dispose() {
    this._gpu?.dispose();
    this._gpu = null;
    this._gpuTried = false;
    this._canvas = null;
    this._ctx = null;
    this._prev = null;
  }
}
