/* MotionWatch service worker — app shell only.
   Camera / MediaRecorder / IndexedDB recordings still require a live page and permissions.
   Offline does NOT enable background recording.
*/
const CACHE = "motionwatch-shell-version2026-10-16-21-44";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/main.js",
  "./src/styles/tokens.css",
  "./src/styles/app.css",
  "./src/i18n/locales.js",
  "./src/services/i18n.js",
  "./src/version.js",
  "./src/services/areas.js",
  "./src/services/schedule.js",
  "./src/services/sound.js",
  "./src/services/concat.js",
  "./src/services/urlsettings.js",
  "./src/styles/shared.js",
  "./src/components/icons.js",
  "./src/services/settings.js",
  "./src/services/storage.js",
  "./src/services/capabilities.js",
  "./src/services/motion.js",
  "./src/services/recorder.js",
  "./src/services/zip.js",
  "./src/vendor/fflate.js",
  "./src/components/motion-app.js",
  "./src/components/app-tabs.js",
  "./src/components/status-indicator.js",
  "./src/components/camera-monitor.js",
  "./src/components/recording-list.js",
  "./src/components/motion-settings.js",
  "./src/components/area-editor.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network first: when online every load revalidates with the server, so a deploy is visible on the
// next load. The cache is the offline fallback (and is refreshed on every successful fetch).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(request, { cache: "no-cache" });
      if (fresh.ok) {
        // settings live in the query string (?s=60&…): store pages without it
        const cache = await caches.open(CACHE);
        cache.put(new Request(url.origin + url.pathname), fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
