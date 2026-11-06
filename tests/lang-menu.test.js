const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, loadLanding } = require("./load-app");

for (const [name, load] of [["app", loadApp], ["landing page", loadLanding]]) {
  test(`${name}: the language menu opens, switches language and closes`, () => {
    const { window, document, run } = load();
    const wrap = document.querySelector(".lang-menu"), trigger = wrap.querySelector(".lang-trigger"), list = wrap.querySelector(".lang-list");
    assert.equal(list.hidden, true);
    trigger.click();
    assert.equal(list.hidden, false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    list.querySelector('[data-lang="fr"]').click();
    assert.equal(list.hidden, true, "menu closes after choosing");
    assert.equal(document.documentElement.lang, "fr");
    assert.equal(wrap.querySelector(".lang-code").textContent, "FR");
    assert.equal(list.querySelector('[data-lang="fr"]').getAttribute("aria-current"), "true");
    trigger.click();
    document.body.click();
    assert.equal(list.hidden, true, "clicking elsewhere closes the menu");
    trigger.click();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(list.hidden, true, "Escape closes the menu");
    list.querySelector('[data-lang="ar"]').click();
    assert.equal(document.documentElement.dir, "rtl");
    run(`setLanguage("en", false)`);
  });
}
