# Backlog

What is *not* built yet, roughly in priority order. Done features are listed in the README.

## Needs verification on real devices (highest risk)

- **Safari / iOS end to end.** Everything was developed and tested in Chromium with a fake camera and microphone. Still unverified in Safari: the live picture (a canvas fallback exists, see Settings → Camera → *Live picture rendering*), MP4/AAC clips with sound, microphone permission flow, Wake Lock, IndexedDB limits on iOS.
- **GPU detection performance** on real phones/laptops (tests run on software GL, so speed-ups are unmeasured).
- **A screen-reader pass** (VoiceOver, NVDA). The a11y work is semantic and keyboard-tested, but not verified with assistive tech or an automated checker such as axe.

## Detection

- **Pre-roll buffer**: include the few seconds *before* the trigger in the clip (deferred earlier in `DECISIONS.md`).
- **Exclusion areas** and a **per-area trigger action** (sensitivity is already per area).
- **Adaptive thresholds**: learn the noise floor for sound and the background for motion instead of fixed levels.
- **Sound frequency band** (e.g. only react to glass-break or speech ranges) and a sound-level history graph.
- Analysis in a **Worker / OffscreenCanvas** so a busy UI can never slow detection.

## Recording & library

- **Event log / timeline** with the trigger reason (motion, sound, which area) stored on each clip, plus search, filter and sort by date.
- **Retention rules**: auto-delete after N days or above a storage cap, protect/star clips, storage-quota warnings before a recording fails.
- **Trim** a clip; **share** via the Web Share API; import clips.
- **Faster, lossless combine / timelapse** (also for browsers that can only record WebM, where MP4 output would need a transcoder): today combined videos are re-recorded in real time (timelapse runs at its speed-up, capped at ×16) (WebCodecs + a muxer, or `ffmpeg.wasm`, would be quicker and keep the original quality).
- Optional **still snapshots** or **time-lapse** instead of video.
- Camera options: switch camera while running, resolution/fps choice, zoom/exposure where the device allows.
- Configurable timestamp (format, position, camera name) and optional watermark text.

## Alerts & integration (opt-in, off by default)

- Local notifications while the page is open; webhook / ntfy / email on trigger.
- Upload to a user-owned target (WebDAV / S3). Nothing leaves the device today, by design.

## Scheduling & power

- The page must stay open for schedules to work (browsers do not allow background capture). Ideas: a "keep this tab alive" helper screen, a clearer *waiting for schedule* wake-lock mode, and a countdown to the next window.
- Settings **profiles** (named presets such as *Night*, *Away*) and a **QR code** for the settings link.

## App polish

- PNG icons / `apple-touch-icon` / splash screens for a proper home-screen install; an "update available" toast when a new version has been cached.
- Encrypt recordings at rest (WebCrypto) with an optional passcode.
- More languages and RTL support.
- Cross-browser e2e in CI (Firefox and WebKit via Playwright) and visual-regression screenshots.

## Housekeeping

- `CODEPEN.md` and `DECISIONS.md` come from the original export and describe the first MVP (for example the burned-in REC label, which has been removed); `ACCEPTANCE.md` now points at the automated tests.
