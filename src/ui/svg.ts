/** Inline SVG glyphs for progress-track nodes and HUD buttons (stone/metal palette). */

const stroke = 'stroke="#14110f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

export const ICON = {
  camp: `<svg viewBox="0 0 32 32"><path d="M16 4c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 2-5 3-7 1 2 2 3 3 3 0-4-1-7 1-11z" fill="#f08a24" ${stroke}/><path d="M16 15c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 1 1 1 1 2 1z" fill="#ffd36b" ${stroke}/><path d="M6 28l20-3M26 28L6 25" ${stroke} fill="none" stroke="#6b4a2c"/></svg>`,
  swords: `<svg viewBox="0 0 32 32"><path d="M6 5l9 13 2-2L8 4z" fill="#d8d6cf" ${stroke}/><path d="M26 5l-9 13-2-2 9-12z" fill="#d8d6cf" ${stroke}/><path d="M11 17l4 4-3 3-3-1-1-3zM21 17l-4 4 3 3 3-1 1-3z" fill="#8a6a3c" ${stroke}/></svg>`,
  skull: `<svg viewBox="0 0 32 32"><path d="M16 4c-6 0-10 4-10 10 0 3 1 5 3 6v5h4v-3h2v3h2v-3h2v3h4v-5c2-1 3-3 3-6 0-6-4-10-10-10z" fill="#d6d2c4" ${stroke}/><circle cx="11.5" cy="14" r="2.6" fill="#14110f"/><circle cx="20.5" cy="14" r="2.6" fill="#14110f"/><path d="M16 17l-1.5 3h3z" fill="#14110f"/></svg>`,
  boss: `<svg viewBox="0 0 32 32"><path d="M5 4c1 6 3 8 7 9M27 4c-1 6-3 8-7 9" fill="none" stroke="#14110f" stroke-width="5" stroke-linecap="round"/><path d="M5 4c1 6 3 8 7 9M27 4c-1 6-3 8-7 9" fill="none" stroke="#cbb88a" stroke-width="2.4" stroke-linecap="round"/><path d="M16 8c-5 0-8 3-8 8 0 2 1 4 2 5v5h3v-2h2v2h2v-2h2v2h3v-5c1-1 2-3 2-5 0-5-3-8-8-8z" fill="#d6d2c4" ${stroke}/><circle cx="12.5" cy="17" r="2.2" fill="#c8301f"/><circle cx="19.5" cy="17" r="2.2" fill="#c8301f"/></svg>`,
  portal: `<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="9" ry="12" fill="#1b4fd1" stroke="#0a1c52" stroke-width="3"/><ellipse cx="16" cy="16" rx="5" ry="8" fill="#7fc3ff" opacity=".85"/></svg>`,
  chat: `<svg viewBox="0 0 32 32"><path d="M5 7h22v14H15l-6 5v-5H5z" fill="#cfc9ba" ${stroke}/><circle cx="11" cy="14" r="1.6" fill="#14110f"/><circle cx="16" cy="14" r="1.6" fill="#14110f"/><circle cx="21" cy="14" r="1.6" fill="#14110f"/></svg>`,
  bag: `<svg viewBox="0 0 32 32"><path d="M16 5a11 11 0 0 1 9.5 5.5l2.5-1v7l-6-1 2.4-1A8.5 8.5 0 0 0 16 7.5V5z" fill="#ffb23a" ${stroke}/><path d="M16 27a11 11 0 0 1-9.5-5.5L4 22.500v-7l6 1-2.400 1A8.500 8.500 0 0 0 16 24.500V27z" fill="#ffb23a" ${stroke}/></svg>`,
  crown: `<svg viewBox="0 0 32 32"><path d="M5 24l-1-14 7 6 5-9 5 9 7-6-1 14z" fill="#d9d3c0" ${stroke}/><path d="M5 24h22v3H5z" fill="#8a8272" ${stroke}/></svg>`,
  shield: `<svg viewBox="0 0 32 32"><path d="M16 4l11 4v8c0 6-5 10-11 12C10 26 5 22 5 16V8z" fill="#c9c5b8" ${stroke}/><path d="M16 8l7 2.500V16c0 4-3 7-7 8.500C12 23 9 20 9 16v-5.500z" fill="#4a4658" ${stroke}/><path d="M13 14h6M16 11v8" stroke="#d9d3c0" stroke-width="2" stroke-linecap="round"/></svg>`,
  lock: `<svg viewBox="0 0 32 32"><rect x="7" y="14" width="18" height="13" rx="2" fill="#8a8272" ${stroke}/><path d="M11 14v-3a5 5 0 0 1 10 0v3" fill="none" ${stroke}/></svg>`,
  check: `<svg viewBox="0 0 32 32"><path d="M6 17l7 7 13-15" fill="none" stroke="#2f9e44" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: `<svg viewBox="0 0 32 32"><path d="M16 3l4 9 10 1-7.500 6.500L25 29l-9-5-9 5 2.500-9.500L2 13l10-1z" fill="#ffc83a" ${stroke}/></svg>`,
  droplet: `<svg viewBox="0 0 32 32"><path d="M16 3c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z" fill="#8a4bff" stroke="#2a0e63" stroke-width="2.4"/><path d="M12 18a4 4 0 0 0 3 4" stroke="#d9bfff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  hex: `<svg viewBox="0 0 32 32"><path d="M16 2l12 7v14l-12 7L4 23V9z" fill="#4d4a56" stroke="#14110f" stroke-width="2.4"/><path d="M16 5.500l9 5.200v10.600l-9 5.200-9-5.200V10.700z" fill="#2c2a33"/></svg>`,
  wings: `<svg viewBox="0 0 120 40"><path d="M60 22c-8-12-26-16-50-12 8 3 12 8 14 12-6 0-12 2-18 6 14-2 26 0 36 6 4-6 10-9 18-12z" fill="#7d7766" opacity=".55"/><path d="M60 22c8-12 26-16 50-12-8 3-12 8-14 12 6 0 12 2 18 6-14-2-26 0-36 6-4-6-10-9-18-12z" fill="#7d7766" opacity=".55"/></svg>`,
};
