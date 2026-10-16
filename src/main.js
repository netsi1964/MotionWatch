/**
 * MotionWatch entry point
 */
import "./components/motion-app.js";

// Register service worker for app-shell offline (does not enable background recording)
if ("serviceWorker" in navigator) {
  // A new service worker taking over means newer files are cached: tell the app (not on first install).
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.dispatchEvent(new CustomEvent("mw-update-available"));
  });
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      // look for a new version on load, every 30 minutes and whenever the tab becomes visible again
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    } catch (err) {
      console.warn("[MotionWatch] SW registration failed", err);
    }
  });
}

// Prevent accidental pinch-zoom interference on controls (iOS)
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
