const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadLanding, read } = require("./load-app");

const translatable = text => /\p{L}/u.test(text) && !/^[A-Z]{2,4}$/.test(text);
// Rendered at runtime (dates, amounts, brand/language names) or intentionally untranslated.
const ignored = new Set(["عربي", "Pennywise", "English", "Français", "العربية"]);
const ignoredPattern = /^(\d|[A-Z]+, [A-Z]+ \d)|\bMAD$|^\d+ (Sep|transactions)/;

function untranslatedStatic({ document, run }) {
  const has = text => run(`DICT.fr[${JSON.stringify(text)}] !== undefined && DICT.ar[${JSON.stringify(text)}] !== undefined`);
  const missing = new Set();
  const check = (kind, text) => { text = text.trim(); if (text && translatable(text) && !ignored.has(text) && !ignoredPattern.test(text) && !has(text)) missing.add(`${kind}: ${text}`); };
  const walker = document.createTreeWalker(document.body, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!/^(SCRIPT|STYLE)$/.test(node.parentNode.nodeName)) check("text", node.nodeValue);
  document.querySelectorAll("*").forEach(el => ["placeholder", "aria-label", "title", "alt"].forEach(name => { if (el.hasAttribute(name)) check(name, el.getAttribute(name)); }));
  return [...missing];
}

test("every visible string in app.html has French and Arabic translations", () => {
  assert.deepEqual(untranslatedStatic(loadApp()), []);
});

test("every visible string in index.html has French and Arabic translations", () => {
  assert.deepEqual(untranslatedStatic(loadLanding()), []);
});

test("strings used in app scripts are translated", () => {
  const { run } = loadApp();
  const has = text => run(`DICT.fr[${JSON.stringify(text)}] !== undefined && DICT.ar[${JSON.stringify(text)}] !== undefined`);
  const missing = new Set();
  const calls = /\b(?:tr|toast|trHtml)\(\s*"((?:[^"\\]|\\.)+)"/g;
  const markup = /<[a-z][^<>]*>\s*([A-Za-z][A-Za-z '’.,!?-]{1,60}?)\s*</g; // text inside HTML written by the scripts
  for (const file of ["app.js", "features.js", "report.js", "accounts.js", "upcoming.js"]) {
    const source = read(file);
    for (const match of source.matchAll(calls)) { const text = JSON.parse(`"${match[1]}"`); if (!text.includes("${") && translatable(text) && !has(text)) missing.add(`${file}: ${text}`); }
    for (const match of source.matchAll(markup)) { const text = match[1].trim(); if (!ignored.has(text) && !has(text)) missing.add(`${file}: ${text}`); }
  }
  assert.deepEqual([...missing], []);
});

test("translations keep the same {placeholders} as the English text", () => {
  const { run } = loadApp();
  const entries = run(`Object.keys(DICT.fr).map(key => [key, typeof DICT.fr[key] === "function" ? null : DICT.fr[key], typeof DICT.ar[key] === "function" ? null : DICT.ar[key]])`);
  const slots = text => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const problems = [];
  for (const [key, fr, ar] of entries) {
    if (fr !== null && slots(fr) !== slots(key)) problems.push(`fr: ${key}`);
    if (ar !== null && slots(ar) !== slots(key)) problems.push(`ar: ${key}`);
  }
  assert.deepEqual(problems, []);
});

test("translations are not empty and tr() falls back to English", () => {
  const { run } = loadApp();
  assert.equal(run(`DICT.fr["Overview"]`), "Aperçu");
  assert.equal(run(`Object.values(DICT.fr).concat(Object.values(DICT.ar)).filter(v => typeof v === "string" && !v.trim()).length`), 0);
  assert.equal(run(`tr("A sentence that has no translation")`), "A sentence that has no translation");
  assert.equal(run(`tr("{n} days ago", { n: 3 })`).includes("3"), true);
});
