const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const offset = days => run(`dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (${days}), 12))`);
const pot = (id, saved, target, extra = {}) => ({ id, name: id, saved, target, color: "teal", ...extra });
// Pots are created through transfers, so the balance and each pot's history agree with `saved`.
const setPots = (pots, settings = {}) => run(`data = cleanData(${JSON.stringify({
  accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 100000 }],
  rule: { type: "off", amount: 20 }, settings,
  pots, transfers: pots.filter(p => p.saved).map(p => ({ id: `seed-${p.id}`, amount: p.saved, date: offset(-30), destination: `pot:${p.id}` }))
})}); syncCategories();`);
const saved = () => run("Object.fromEntries(data.pots.map(p => [p.id, p.saved]))");
const potTransfers = id => run(`data.transfers.filter(t => t.destination === "pot:${id}").reduce((s, t) => s + t.amount, 0)`);

test("an important pot due soon is topped up by the least important pots first", () => {
  setPots([pot("rent", 200, 1000, { due: offset(10) }), pot("trip", 500, 2000), pot("gifts", 400, 500)]);
  const before = run("allBalance()");
  const moves = run("rebalancePots()");
  assert.deepEqual(saved(), { rent: 1000, trip: 100, gifts: 0 });
  assert.deepEqual(moves.map(m => [m.from, m.amount]), [["gifts", 400], ["trip", 400]]);
  assert.equal(run("allBalance()"), before, "moving money between pots never changes the balance");
  for (const id of ["rent", "trip", "gifts"]) assert.equal(potTransfers(id), saved()[id], `${id}: history matches the amount saved`);
});

test("pots due later than the live window, or already past, are left alone", () => {
  setPots([pot("later", 0, 1000, { due: offset(45) }), pot("past", 0, 1000, { due: offset(-1) }), pot("spare", 800, 800)]);
  assert.equal(run("rebalancePots().length"), 0);
  run(`data.settings.liveWindow = 60`);
  run("rebalancePots()");
  assert.deepEqual(saved(), { later: 800, past: 0, spare: 0 });
});

test("protected pots and more important pots never give money", () => {
  setPots([pot("emergency", 5000, 6000), pot("car", 0, 1000, { due: offset(3) }), pot("safe", 900, 900, { locked: true }), pot("fun", 300, 600)]);
  run("rebalancePots()");
  assert.deepEqual(saved(), { emergency: 5000, car: 300, safe: 900, fun: 0 });
  run("render()");
  const card = document.querySelectorAll("#potsGrid .pot-card")[1];
  assert.ok(card.classList.contains("live-short"));
  assert.match(card.textContent, /Still 700\.00 MAD short/);
  assert.match(card.textContent, /Topped up 300\.00 MAD/);
});

test("live pots can be turned off", () => {
  setPots([pot("rent", 0, 1000, { due: offset(2) }), pot("trip", 500, 2000)], { liveWindow: 0 });
  assert.equal(run("rebalancePots().length"), 0);
  assert.equal(run("cleanData({ settings: { liveWindow: 99 } }).settings.liveWindow"), 30, "invalid windows fall back to 30 days");
});

test("an important pot that becomes due as the days pass is topped up automatically", () => {
  setPots([pot("rent", 0, 500, { due: offset(31) }), pot("trip", 700, 2000)]);
  run("unlocked = true; expandRecurringTransactions()");
  assert.deepEqual(saved(), { rent: 0, trip: 700 });
  run(`refreshToday(new Date("${offset(1)}T08:00:00"))`);
  assert.deepEqual(saved(), { rent: 500, trip: 200 });
  run("refreshToday(new Date()); unlocked = false");
});

test("reordering pots changes who gives to whom, and can be undone", () => {
  setPots([pot("trip", 600, 600), pot("rent", 0, 400, { due: offset(5) })]);
  assert.equal(run("rebalancePots().length"), 0, "the less important pot cannot take from a more important one");
  run("render()");
  document.querySelector('.pot-move[data-id="rent"][data-dir="-1"]').click();
  assert.deepEqual(run("data.pots.map(p => p.id)"), ["rent", "trip"]);
  assert.deepEqual(saved(), { rent: 400, trip: 200 });
  run("undoLast()");
  assert.deepEqual(run("data.pots.map(p => p.id)"), ["trip", "rent"]);
  assert.deepEqual(saved(), { trip: 600, rent: 0 });
});

test("editing a pot saves its date and protection, and the activity log shows top-ups once", () => {
  setPots([pot("rent", 0, 300), pot("gifts", 500, 500)]);
  run("render()");
  document.querySelector('.edit-pot[data-id="rent"]').click();
  assert.equal(document.querySelector("#potName").value, "rent");
  document.querySelector("#potDue").value = offset(7);
  document.querySelector("#potForm").dispatchEvent(new app.window.Event("submit", { cancelable: true }));
  assert.equal(run('data.pots[0].due'), offset(7));
  assert.deepEqual(saved(), { rent: 300, gifts: 200 });
  run("renderSavingsLog()");
  const rows = [...document.querySelectorAll("#savingsLog .log-row.live")];
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /Moved from gifts to rent/);
  const kept = run("cleanData(data)");
  assert.equal(kept.pots[0].due, offset(7));
  assert.ok(kept.transfers.some(t => t.group), "the link between both halves of a move survives saving");
});

test("deleting a pot returns exactly what it holds to the balance", () => {
  setPots([pot("rent", 0, 300, { due: offset(4) }), pot("gifts", 500, 500)]);
  run("rebalancePots()");
  const balance = run("allBalance()");
  run("render()");
  document.querySelector('.delete-pot[data-id="rent"]').click();
  assert.equal(run("allBalance()"), balance + 300);
  assert.equal(potTransfers("gifts"), 200);
});
