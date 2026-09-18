const pennywiseIconPaths = {
  sparkles: '<path d="m12 3-1.2 5.8L5 10l5.8 1.2L12 17l1.2-5.8L19 10l-5.8-1.2L12 3Z"/><path d="m19 16-.5 2.5L16 19l2.5.5L19 22l.5-2.5L22 19l-2.5-.5L19 16Z"/>',
  overview: '<path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z"/>',
  transactions: '<path d="M7 3v18M7 3l-3 3m3-3 3 3M17 21V3m0 18-3-3m3 3 3-3"/>',
  savings: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  goals: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  reports: '<path d="M4 19V5m0 14h16M8 16v-4m4 4V8m4 8V6"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.3a2 2 0 1 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1A2 2 0 1 1 3 15.2l.1-.1A2 2 0 0 0 1.7 12a2 2 0 1 1 0-4h.2a2 2 0 0 0 1.4-3.4L3.2 4A2 2 0 1 1 6 1.2l.1.1A2 2 0 0 0 9.5 0h.2a2 2 0 1 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1A2 2 0 1 1 20 4.3l-.1.1a2 2 0 0 0 1.4 3.4h.2a2 2 0 1 1 0 4h-.2a2 2 0 0 0-1.9 3.2Z" transform="scale(.9) translate(1.3 1.3)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  home: '<path d="m3 10 9-7 9 7v10H3V10Z"/><path d="M9 20v-6h6v6"/>',
  food: '<path d="M7 3v7m-3-7v7a3 3 0 0 0 6 0V3M7 10v11M17 3v18m0-18c3 2 3 6 0 8"/>',
  transport: '<path d="m5 16 2-8h10l2 8M5 16h14M7 16v3m10-3v3M7 11h10M8 19h.01M16 19h.01"/>',
  bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  health: '<path d="M12 20S4 15.4 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20Z"/><path d="M12 9v5m-2.5-2.5h5"/>',
  shopping: '<path d="M5 8h14l-1 12H6L5 8Zm3 0a4 4 0 0 1 8 0"/>',
  gift: '<path d="M4 10h16v10H4V10Zm8 0v10M3 7h18v3H3V7Zm9 0H8.5a2.5 2.5 0 1 1 2.5-2.5V7Zm0 0h3.5a2.5 2.5 0 1 0-2.5-2.5V7Z"/>',
  pencil: '<path d="m4 16-.8 4.8L8 20l11.5-11.5a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="m14.5 7.5 3 3"/>',
  arrowUpRight: '<path d="M5 19 19 5M9 5h10v10"/>',
  arrowDown: '<path d="M12 4v16m0 0 6-6m-6 6-6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  shield: '<path d="M12 3 19 6v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
};

function pennywiseIcon(name, label = "") {
  const path = pennywiseIconPaths[name] || pennywiseIconPaths.sparkles;
  return `<svg class="icon" aria-hidden="${label ? "false" : "true"}"${label ? ` role="img" aria-label="${label}"` : ""} viewBox="0 0 24 24" focusable="false">${path}</svg>`;
}

document.querySelectorAll("[data-icon]").forEach(node => {
  node.innerHTML = pennywiseIcon(node.dataset.icon, node.dataset.iconLabel || "");
});
