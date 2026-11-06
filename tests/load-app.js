const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// Loads a page and its scripts in a jsdom window. Top-level declarations of the
// scripts live in one shared scope, so `run("expr")` can reach functions such as cleanData.
function loadPage(page, scripts, { lang = "en" } = {}) {
  const html = read(page).replace(/<script\s+src="[^"]*"><\/script>/g, "");
  const dom = new JSDOM(html, { url: `https://pennywise.test/${page}`, runScripts: "outside-only" });
  const { window } = dom;
  window.indexedDB = indexedDB;
  window.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(window, "crypto", { value: require("crypto").webcrypto, configurable: true });
  window.localStorage.setItem("pennywise-lang", lang);
  const context = dom.getInternalVMContext();
  scripts.forEach(file => vm.runInContext(read(file), context, { filename: file }));
  const run = code => vm.runInContext(code, context);
  return { dom, window, document: window.document, run };
}

const loadApp = options => loadPage("app.html", ["i18n.js", "icons.js", "app.js", "report.js", "features.js", "accounts.js", "upcoming.js"], options);
const loadLanding = options => loadPage("index.html", ["i18n-landing.js", "i18n.js", "icons.js"], options);

module.exports = { loadApp, loadLanding, read, root };
