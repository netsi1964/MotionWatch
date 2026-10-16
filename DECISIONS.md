# MotionWatch Architectural Decisions Log

## 2026-10-16 - Project start

### Decision: Project structure
- Flat modular ES modules under `src/`
- Components as Custom Elements with Shadow DOM
- Services for camera, motion, recording, storage, i18n, settings
- CSS custom properties for theming; container queries for components

### Decision: Storage
- IndexedDB for video Blobs (via `idb` or native)
- Avoid localStorage for binary data
- Request persistent storage when available

### Decision: Recording pipeline
- getUserMedia → video element (preview)
- Separate low-res analysis canvas for motion detection (frame differencing)
- Recording canvas that composites video + overlay, then `canvas.captureStream()` → MediaRecorder
- Default audio: off (no mic permission)

### Decision: Codecs
- Prefer `video/webm;codecs=vp9` or `vp8`, fallback to `video/mp4` if supported
- Use `MediaRecorder.isTypeSupported()` at runtime
- File extension matches actual MIME

### Decision: Motion detection
- Frame differencing on downsampled grayscale
- Configurable threshold / sensitivity
- Debounce + minimum clip length + quiet period (default 5s)

### Decision: i18n
- Simple JSON dictionaries, no external lib
- Runtime language switch without reload
- Locales: en (default), da, es, zh-Hans

### Decision: ZIP
- Use a lightweight pure-JS ZIP implementation (e.g. fflate or jszip if size ok; prefer minimal)
- Document memory limits for large bulk exports

### Decision: PWA
- Optional service worker + manifest for app shell offline
- Clearly note camera/recording requires secure context + permissions and does not work fully offline in the sense of background capture

### Open questions / defaults chosen
- Pre-recording buffer: deferred to future (stability first)
- Max clip length: configurable, default none or high (e.g. 5 min) to prevent runaway
- Sensitivity default: moderate
