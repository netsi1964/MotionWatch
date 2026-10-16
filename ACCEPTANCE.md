# Acceptance

The acceptance criteria are covered by automated tests. Run them with:

```bash
npm ci
npm test                 # unit tests (node --test)
npx playwright install chromium
npm run test:e2e         # end-to-end tests with a fake camera and microphone
```

| Area | Where |
|---|---|
| Schedules, areas, URL settings, settings migration, sound thresholds, MP4-first codec choice, i18n completeness, version stamp, service-worker asset list | `tests/unit/` |
| Loading, tabs, responsive overflow, theme, language, version, service-worker updates (network-first, offline fallback) | `tests/e2e/smoke.spec.mjs` |
| Settings in the URL | `tests/e2e/urlsettings.spec.mjs` |
| Monitor now / pause, schedules (incl. schedule overrides pause), stop countdown | `tests/e2e/monitoring.spec.mjs` |
| Detection areas editor and masks | `tests/e2e/areas.spec.mjs` |
| GPU and CPU detector, global and per-area sensitivity, throttling, canvas preview | `tests/e2e/detection.spec.mjs` |
| Clips, preview frames, player (prev/next, keyboard), delete, download, ZIP, combined download with black gap, timelapse, MP4 | `tests/e2e/library.spec.mjs` |
| Sound in clips (decoded and checked for non-silence), sound trigger | `tests/e2e/audio.spec.mjs` |
| Safari-style audio policy (suspended audio context, unlock on tap), mic test, muted-mic notice, Camera/Sound button states | `tests/e2e/audio-policy.spec.mjs` |

Not covered automatically: real iOS/macOS Safari, real cameras and microphones, screen readers. See `BACKLOG.md`.
