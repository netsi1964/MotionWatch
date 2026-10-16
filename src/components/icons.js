/** Inline SVG icons (24×24, stroke = currentColor). Use `icon("name")` inside template strings. */
const P = {
  camera: '<path d="M4 8a2 2 0 0 1 2-2h1.6l1.2-1.6A1 1 0 0 1 9.6 4h4.8a1 1 0 0 1 .8.4L16.4 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10 6-3.5v11l-6-3.5z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 6.5v11M15 6.5v11" stroke-width="2.6"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke-linejoin="round"/>',
  power: '<path d="M12 3.5v8"/><path d="M6.4 7a8 8 0 1 0 11.2 0"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  volume: '<path d="M4 10v4h3.5L12 18V6L7.5 10z" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 7a7 7 0 0 1 0 10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2 1.5M9.5 3h5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  cameraOff: '<path d="M4 8a2 2 0 0 1 2-2h1.6l1.2-1.6A1 1 0 0 1 9.6 4h4.8a1 1 0 0 1 .8.4L16.4 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/><path d="M3.5 3.5l17 17"/>',
  micOff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3.5 3.5l17 17"/>',
  film: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9h17M3.5 15h17M8.5 4v16M15.5 4v16"/>',
};

/** @param {keyof typeof P} name @param {string} [cls] */
export function icon(name, cls = "ico") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
}

/** App logo mark */
export const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="9" fill="#e11d48"/><circle cx="16" cy="16" r="8.2" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="16" cy="16" r="3.4" fill="#fff"/></svg>`;
