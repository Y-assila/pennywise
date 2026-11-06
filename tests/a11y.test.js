const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const { window, document, run } = loadApp();
const key = (key, options = {}) => document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));

test("every modal is a labelled dialog", () => {
  const modals = [...document.querySelectorAll(".modal")];
  assert.ok(modals.length >= 10);
  for (const modal of modals) {
    assert.equal(modal.getAttribute("role"), "dialog");
    assert.equal(modal.getAttribute("aria-modal"), "true");
    const title = document.getElementById(modal.getAttribute("aria-labelledby"));
    assert.ok(title && title.textContent.trim(), `modal ${modal.parentElement.id} needs a visible title`);
  }
});

test("every button and form control has an accessible name", () => {
  const unnamed = [];
  document.querySelectorAll("button").forEach(button => {
    if (!(button.textContent.trim() || button.getAttribute("aria-label") || button.getAttribute("title") || button.querySelector("[aria-label]"))) unnamed.push(button.id || button.className);
  });
  document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]), select, textarea").forEach(field => {
    if (field.hidden) return;
    const named = field.closest("label") || field.getAttribute("aria-label") || (field.id && document.querySelector(`label[for="${field.id}"]`));
    if (!named) unnamed.push(`#${field.id}`);
  });
  assert.deepEqual(unnamed, []);
});

test("opening a modal moves focus into it and closing restores focus", () => {
  const opener = document.querySelector("#addGoalBtn");
  opener.focus();
  run(`openModal("#goalModal")`);
  assert.ok(document.querySelector("#goalModal .modal").contains(document.activeElement));
  key("Escape");
  assert.equal(document.querySelector("#goalModal").classList.contains("open"), false);
  assert.equal(document.activeElement, opener);
});

test("Tab stays inside an open modal", () => {
  run(`openModal("#goalModal")`);
  const items = [...document.querySelectorAll("#goalModal button, #goalModal input")];
  items[items.length - 1].focus();
  key("Tab");
  assert.equal(document.activeElement, items[0]);
  key("Tab", { shiftKey: true });
  assert.equal(document.activeElement, items[items.length - 1]);
  run("closeModals()");
});

test("the active navigation item is exposed with aria-current", () => {
  const goals = document.querySelector('.sidebar .nav-item[data-view="goals"]');
  goals.click();
  const current = [...document.querySelectorAll('[aria-current="page"]')].map(el => el.dataset.view);
  assert.deepEqual(current, ["goals", "goals"]);
  document.querySelector('.sidebar .nav-item[data-view="overview"]').click();
});
