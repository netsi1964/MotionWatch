# Using MotionWatch with CodePen

## Reality check

CodePen’s default editor runs inside a sandboxed iframe. **`getUserMedia` (camera) is often blocked or restricted** there. For a real camera/motion demo you need either:

1. **Debug Mode** or **full-page view** on an HTTPS pen, or  
2. A deployment on **GitHub Pages / Netlify / your own HTTPS host**, or  
3. Local `localhost` (this zip).

IndexedDB, MediaRecorder, and `canvas.captureStream()` also need a normal top-level secure context to behave reliably.

## Recommended workflow

### A. Best: use the full project (this zip)

```bash
unzip motionwatch-codepen.zip
cd motionwatch
python3 -m http.server 8080
# open http://localhost:8080
```

Or push the `motionwatch/` folder to GitHub and enable Pages.

### B. CodePen (limited)

1. Create a new pen.  
2. Settings → JavaScript → set **JavaScript Preprocessor** to none; enable **Type="module"** if available (or use the module approach below).  
3. CodePen does **not** load multi-file ES module trees from the three panes easily. Options:

   - Host this repo on GitHub Pages and set the pen’s HTML to:

     ```html
     <iframe src="https://YOURUSER.github.io/YOURREPO/" style="width:100%;height:100vh;border:0" allow="camera;fullscreen" allowfullscreen></iframe>
     ```

   - Or use **CodePen Projects** (Pro) and upload the files from this zip so relative `import` paths resolve.

4. Add the permission attribute if embedding:

   ```html
   allow="camera; microphone; fullscreen; display-capture"
   ```

   (Microphone is not required by MotionWatch; camera is.)

## What is in this zip

| Item | Role |
|------|------|
| `index.html` | App entry |
| `src/` | All modules (components, services, i18n, styles, vendor/fflate) |
| `sw.js` + `manifest.webmanifest` | Optional PWA shell |
| `README.md` | Full docs |
| `ACCEPTANCE.md` | Test checklist |

There is no separate “paste these three panes” bundle because the app is intentionally modular (Custom Elements + ES modules + local ZIP library). For a single-paste demo, deploy the folder or iframe the deployed URL.

## Quick smoke test after unzip

1. Serve over `http://localhost` or HTTPS.  
2. Allow camera.  
3. Move in front of the camera → recording should start.  
4. Stay still ~5 seconds → clip appears under Recordings.  
5. Download a clip and play it outside the app → REC + timestamp should be visible in the file.
