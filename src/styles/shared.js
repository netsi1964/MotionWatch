/**
 * Design primitives shared by every component's shadow root
 * (buttons, switches, fields, sliders, segmented control, chips, cards, icons).
 * Include as `<style>${sharedCss}</style>` at the top of a template.
 */
export const sharedCss = `
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, input, select, textarea { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; background: none; padding: 0; -webkit-tap-highlight-color: transparent; }
  button:disabled { cursor: not-allowed; }
  :focus-visible { outline: 2px solid var(--mw-focus); outline-offset: 2px; }
  .ico { width: 1.25em; height: 1.25em; flex: none; display: block; }
  .ico-lg { width: 1.6em; height: 1.6em; }

  /* ---- buttons ---- */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--mw-space-2);
    min-height: var(--mw-touch-min); padding: 0 var(--mw-space-4); border-radius: var(--mw-radius);
    background: var(--mw-surface-3); color: var(--mw-text); border: 1px solid transparent;
    font-size: var(--mw-text-sm); font-weight: 600; letter-spacing: -0.005em; white-space: nowrap;
    transition: background var(--mw-transition), transform var(--mw-transition), border-color var(--mw-transition), opacity var(--mw-transition);
  }
  .btn:hover:not(:disabled) { background: var(--mw-border-strong); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.45; }
  .btn-primary { background: var(--mw-accent); color: var(--mw-on-accent); }
  .btn-primary:hover:not(:disabled) { background: var(--mw-accent-hover); }
  .btn-outline { background: transparent; border-color: var(--mw-border-strong); }
  .btn-ghost { background: transparent; }
  .btn-ghost:hover:not(:disabled) { background: var(--mw-surface-3); }
  .btn-danger { color: var(--mw-danger-text); background: transparent; border-color: var(--mw-border); }
  .btn-icon { width: var(--mw-touch-min); padding: 0; border-radius: var(--mw-radius-full); }
  .btn-sm { min-height: 36px; padding: 0 var(--mw-space-3); }

  /* ---- fields ---- */
  input[type="text"], input[type="number"], input[type="time"], input[type="date"], select {
    width: 100%; min-height: var(--mw-touch-min); padding: 0 var(--mw-space-3);
    background: var(--mw-surface-2); color: var(--mw-text);
    border: 1px solid var(--mw-border); border-radius: var(--mw-radius);
    transition: border-color var(--mw-transition), background var(--mw-transition);
  }
  input[type="text"]:hover, input[type="number"]:hover, input[type="time"]:hover, input[type="date"]:hover, select:hover { border-color: var(--mw-border-strong); }
  input[type="text"]:focus-visible, input[type="number"]:focus-visible, input[type="time"]:focus-visible, input[type="date"]:focus-visible, select:focus-visible {
    outline: 2px solid var(--mw-focus); outline-offset: 0; border-color: transparent;
  }
  select { appearance: none; -webkit-appearance: none; padding-right: 2.25rem;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 0.7rem center; background-size: 1.1rem; }
  option { background: var(--mw-surface); color: var(--mw-text); }

  /* ---- switch (checkbox) ---- */
  input[type="checkbox"].switch {
    appearance: none; -webkit-appearance: none; flex: none; position: relative; cursor: pointer;
    width: 3rem; height: 1.75rem; margin: 0; border-radius: var(--mw-radius-full);
    background: var(--mw-surface-3); border: 1px solid var(--mw-border-strong);
    transition: background var(--mw-transition), border-color var(--mw-transition);
  }
  input[type="checkbox"].switch::before {
    content: ""; position: absolute; top: 50%; left: 0.2rem; width: 1.2rem; height: 1.2rem; border-radius: 50%;
    background: var(--mw-text-muted); transform: translateY(-50%); transition: transform var(--mw-transition), background var(--mw-transition);
  }
  input[type="checkbox"].switch:checked { background: var(--mw-accent); border-color: var(--mw-accent); }
  input[type="checkbox"].switch:checked::before { transform: translate(1.2rem, -50%); background: #fff; }
  input[type="checkbox"].switch:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ---- round check (selection) ---- */
  input[type="checkbox"].check {
    appearance: none; -webkit-appearance: none; margin: 0; width: 1.6rem; height: 1.6rem; flex: none; cursor: pointer;
    border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); background: rgba(0,0,0,0.35); position: relative;
    transition: background var(--mw-transition), border-color var(--mw-transition);
  }
  input[type="checkbox"].check:checked { background: var(--mw-accent); border-color: var(--mw-accent); }
  input[type="checkbox"].check:checked::after {
    content: ""; position: absolute; left: 50%; top: 46%; width: 0.4rem; height: 0.75rem;
    border: solid #fff; border-width: 0 2.5px 2.5px 0; transform: translate(-50%, -50%) rotate(45deg);
  }

  /* ---- range ---- */
  input[type="range"] {
    -webkit-appearance: none; appearance: none; width: 100%; height: 1.75rem; background: transparent; margin: 0; cursor: pointer;
    --pct: 50%;
  }
  input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;
    background: linear-gradient(to right, var(--mw-accent) var(--pct), var(--mw-surface-3) var(--pct)); }
  input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: var(--mw-surface-3); }
  input[type="range"]::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--mw-accent); }
  input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -8px; border-radius: 50%;
    background: #fff; border: 2px solid var(--mw-accent); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
  input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid var(--mw-accent); }

  /* ---- segmented control (radio group) ---- */
  .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--mw-surface-2); border: 1px solid var(--mw-border); border-radius: var(--mw-radius); }
  .seg label { position: relative; margin: 0; }
  .seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .seg span {
    display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 var(--mw-space-4);
    border-radius: calc(var(--mw-radius) - 3px); font-size: var(--mw-text-sm); font-weight: 600; color: var(--mw-text-muted);
    transition: background var(--mw-transition), color var(--mw-transition);
  }
  .seg input:checked + span { background: var(--mw-surface); color: var(--mw-text); box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
  .seg input:focus-visible + span { outline: 2px solid var(--mw-focus); outline-offset: 1px; }

  /* ---- chip toggle ---- */
  .chip { min-width: 2.75rem; min-height: 2.5rem; padding: 0 var(--mw-space-3); border-radius: var(--mw-radius-full);
    background: var(--mw-surface-2); border: 1px solid var(--mw-border); font-size: var(--mw-text-sm); font-weight: 600; color: var(--mw-text-muted);
    transition: background var(--mw-transition), color var(--mw-transition), border-color var(--mw-transition); }
  .chip[aria-pressed="true"] { background: var(--mw-accent); border-color: var(--mw-accent); color: var(--mw-on-accent); }

  /* ---- cards / pills ---- */
  .card { background: var(--mw-surface); border: 1px solid var(--mw-border); border-radius: var(--mw-radius-lg); }
  .glass { background: var(--mw-glass); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); border: 1px solid var(--mw-border); }
  .pill-dark { background: rgba(0,0,0,0.62); color: var(--mw-on-dark); border-radius: var(--mw-radius-full); padding: 0.2rem 0.65rem;
    font-size: var(--mw-text-xs); font-weight: 600; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }

  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
`;

/** Keep the filled part of a range track in sync with its value (WebKit has no ::progress). */
export function syncRange(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100);
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.setProperty("--pct", `${pct}%`);
}
