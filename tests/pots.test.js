const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const offset = days => run(`dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (${days}), 12))`);
const pot = (id, saved, target, extra = {}) => ({ id, name: id, saved, target, color: "teal", ...extra });
// Pots are created through transfers, so the balance and each pot's history agree with `saved`.
const setPots = pots => run(`data = cleanData(${JSON.stringify({
  accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 100000 }], rule: { type: "off", amount: 20 },
  pots, transfers: pots.filter(p => p.saved).map(p => ({ id: `seed-${p.id}`, amount: p.saved, date: offset(-30), destination: `pot:${p.id}` }))
})}); syncCategories(); render();`);
const saved = () => run("Object.fromEntries(data.pots.map(p => [p.id, p.saved]))");
const potTransfers = id => run(`data.transfers.filter(t => t.destination === "pot:${id}").reduce((s, t) => s + t.amount, 0)`);
const submit = selector => document.querySelector(selector).dispatchEvent(new app.window.Event("submit", { cancelable: true }));
const click = selector => document.querySelector(selector).click();

test("money never moves between pots on its own", () => {
  setPots([pot("rent", 0, 1000, { due: offset(3) }), pot("gifts", 500, 500)]);
  run("unlocked = true; expandRecurringTransactions()");
  run(`refreshToday(new Date("${offset(1)}T08:00:00"))`);
  assert.deepEqual(saved(), { rent: 0, gifts: 500 });
  run("refreshToday(new Date()); unlocked = false");
});

test("the fill plan proposes the least important pots first and skips protected ones", () => {
  setPots([pot("emergency", 5000, 6000), pot("rent", 200, 1000), pot("safe", 900, 900, { locked: true }), pot("trip", 500, 2000), pot("gifts", 400, 500)]);
  assert.deepEqual(run(`fillPlan(data.pots[1]).map(p => [p.donor.id, p.amount])`), [["gifts", 400], ["trip", 400]]);
  assert.deepEqual(run(`fillPlan(data.pots[3]).map(p => p.donor.id)`), ["gifts"], "only pots below it are proposed");
  assert.equal(run(`fillPlan(data.pots[4]).length`), 0, "the least important pot has nothing below it");
});

test("you confirm the fill, can change amounts or untick a pot, and the balance stays the same", () => {
  setPots([pot("rent", 200, 1000), pot("trip", 500, 2000), pot("gifts", 400, 500)]);
  const balance = run("allBalance()");
  click('.fill-pot[data-id="rent"]');
  assert.ok(document.querySelector("#fillModal").classList.contains("open"));
  assert.deepEqual(saved(), { rent: 200, trip: 500, gifts: 400 }, "opening the dialog moves nothing");
  document.querySelector('[data-amount="gifts"]').value = "150";
  document.querySelector('[data-donor="trip"]').checked = false;
  document.querySelector("#fillList").dispatchEvent(new app.window.Event("input", { bubbles: true }));
  assert.match(document.querySelector("#fillTotal").textContent, /Moving 150\.00 MAD · 650\.00 MAD still needed/);
  submit("#fillForm");
  assert.deepEqual(saved(), { rent: 350, trip: 500, gifts: 250 });
  assert.equal(run("allBalance()"), balance);
  for (const id of ["rent", "trip", "gifts"]) assert.equal(potTransfers(id), saved()[id], `${id}: history matches the amount saved`);
  run("renderSavingsLog()");
  const rows = [...document.querySelectorAll("#savingsLog .log-row.live")];
  assert.equal(rows.length, 1); assert.match(rows[0].textContent, /Moved from gifts to rent/);
  run("undoLast()");
  assert.deepEqual(saved(), { rent: 200, trip: 500, gifts: 400 });
});

test("a pot can never give more than it holds", () => {
  setPots([pot("rent", 0, 1000), pot("gifts", 100, 500)]);
  click('.fill-pot[data-id="rent"]');
  document.querySelector('[data-amount="gifts"]').value = "999";
  submit("#fillForm");
  assert.deepEqual(saved(), { rent: 100, gifts: 0 });
});

test("the fill button only appears when a pot is short and a pot below it can give", () => {
  setPots([pot("full", 500, 500), pot("short", 0, 300), pot("empty", 0, 100), pot("locked", 400, 400, { locked: true })]);
  const buttons = [...document.querySelectorAll(".fill-pot")].map(b => b.dataset.id);
  assert.deepEqual(buttons, []);
  setPots([pot("short", 0, 300), pot("spare", 50, 100)]);
  assert.deepEqual([...document.querySelectorAll(".fill-pot")].map(b => b.dataset.id), ["short"]);
});

test("you choose the order with the arrows, and it can be undone", () => {
  setPots([pot("trip", 600, 600), pot("rent", 0, 400)]);
  click('.pot-move[data-id="rent"][data-dir="-1"]');
  assert.deepEqual(run("data.pots.map(p => p.id)"), ["rent", "trip"]);
  assert.deepEqual(saved(), { rent: 0, trip: 600 }, "changing the order moves no money");
  assert.equal(document.querySelector("#potsGrid .pot-rank").textContent, "#1");
  run("undoLast()");
  assert.deepEqual(run("data.pots.map(p => p.id)"), ["trip", "rent"]);
});

test("a due date is a reminder: the pot is highlighted when it is close and short", () => {
  setPots([pot("car", 100, 900, { due: offset(10) }), pot("later", 0, 900, { due: offset(90) }), pot("ready", 900, 900, { due: offset(5) })]);
  const cards = [...document.querySelectorAll("#potsGrid .pot-card")];
  assert.deepEqual(cards.map(c => c.classList.contains("due-soon")), [true, false, false]);
  assert.match(cards[0].textContent, /10 days left/);
  assert.match(cards[2].textContent, /Ready/);
});

test("editing a pot saves its date and protection", () => {
  setPots([pot("rent", 0, 300), pot("gifts", 500, 500)]);
  click('.edit-pot[data-id="rent"]');
  assert.equal(document.querySelector("#potName").value, "rent");
  document.querySelector("#potDue").value = offset(7);
  document.querySelector("#potLocked").checked = true;
  submit("#potForm");
  assert.equal(run("data.pots[0].due"), offset(7));
  assert.equal(run("data.pots[0].locked"), true);
  assert.deepEqual(saved(), { rent: 0, gifts: 500 }, "saving a pot moves no money");
  const kept = run("cleanData(data)");
  assert.equal(kept.pots[0].due, offset(7)); assert.equal(kept.pots[0].locked, true);
});

test("deleting a pot returns exactly what it holds to the balance", () => {
  setPots([pot("rent", 0, 300), pot("gifts", 500, 500)]);
  run("movePotMoney(data.pots[1], data.pots[0], 300); render()");
  const balance = run("allBalance()");
  click('.delete-pot[data-id="rent"]');
  assert.equal(run("allBalance()"), balance + 300);
  assert.equal(potTransfers("gifts"), 200);
});
