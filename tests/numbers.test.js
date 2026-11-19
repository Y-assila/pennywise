const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const setData = obj => run(`data = cleanData(${JSON.stringify(obj)}); syncCategories();`);
const offset = days => run(`dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (${days}), 12))`);
const tx = (id, extra) => ({ id, type: "expense", amount: 10, category: "Bills", notes: id, frequency: "One-time", date: offset(0), ...extra });
const moveTo = key => run(`refreshToday(new Date("${key}T09:00:00"))`);
const realToday = () => run("refreshToday(new Date())");

test.afterEach(() => { realToday(); run("unlocked = false; confirm = () => false"); });

test("future-dated items are listed but do not count until their date", () => {
  setData({ accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 1000 }], transactions: [tx("now", { amount: 100 }), tx("rent", { amount: 400, date: offset(5) })] });
  assert.equal(run("allBalance()"), 900);
  assert.equal(run('accountBalance("main")'), 900);
  run("render()");
  const rows = [...document.querySelectorAll("#transactionTable .table-row")];
  assert.equal(rows.length, 2, "both items stay visible in the full list");
  assert.ok(rows.some(row => row.textContent.includes("Upcoming")), "the future item is marked as upcoming");
  assert.equal(document.querySelectorAll("#recentTransactions .transaction-item").length, 1, "recent activity only shows what happened");
  assert.equal(run("upcomingItems(30).map(i => i.name)").join(), "rent");
});

test("a future item counts once the day arrives, even if the app stayed open", () => {
  setData({ transactions: [tx("bill", { amount: 50, date: offset(1) })] });
  run("unlocked = true");
  assert.equal(run("allBalance()"), 0);
  assert.equal(moveTo(offset(1)), true);
  assert.equal(run("allBalance()"), -50);
  assert.equal(run("todayKey()"), run(`dateKey(today)`));
  assert.equal(moveTo(offset(0)), false, "same day: nothing to redo");
});

test("recurring items due today are added in the morning, not only after noon", () => {
  run(`refreshToday(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 5))`);
  setData({ rule: { type: "off", amount: 20 }, transactions: [tx("gym", { date: offset(-7), frequency: "Weekly" })] });
  run("expandRecurringTransactions()");
  assert.deepEqual(run("data.transactions.filter(t => t.generated).map(t => t.date)"), [offset(0)]);
});

test("a recurring item due tomorrow is created when the app moves to the next day", () => {
  setData({ rule: { type: "off", amount: 20 }, transactions: [tx("gym", { date: offset(-6), frequency: "Weekly" })] });
  run("unlocked = true; expandRecurringTransactions()");
  assert.equal(run("data.transactions.filter(t => t.generated).length"), 0);
  moveTo(offset(1));
  assert.deepEqual(run("data.transactions.filter(t => t.generated).map(t => t.date)"), [run("todayKey()")]);
});

test("changing a recurring item's date rebuilds its copies instead of duplicating them", () => {
  setData({ rule: { type: "off", amount: 20 }, transactions: [tx("rent", { amount: 500, date: offset(-70), frequency: "Monthly" })] });
  run("expandRecurringTransactions()");
  const before = run("data.transactions.filter(t => t.generated).length");
  assert.ok(before >= 2);
  const result = run(`editTransaction(data.transactions.findIndex(t => t.id === "rent"), { ...data.transactions.find(t => t.id === "rent"), date: "${offset(-69)}" }); `);
  assert.equal(result, "rescheduled");
  run("expandRecurringTransactions()");
  const copies = run("data.transactions.filter(t => t.generated)");
  assert.equal(copies.length, before, "same number of payments, now on the new day");
  assert.equal(new Set(copies.map(c => c.date)).size, copies.length);
  assert.ok(copies.every(c => c.sourceId === "rent"));
});

test("switching a recurring item to one-time removes its copies", () => {
  setData({ rule: { type: "off", amount: 20 }, transactions: [tx("rent", { amount: 500, date: offset(-70), frequency: "Monthly" })] });
  run("expandRecurringTransactions()");
  run(`editTransaction(0, { ...data.transactions[0], frequency: "One-time" }); expandRecurringTransactions()`);
  assert.equal(run("data.transactions.length"), 1);
  assert.equal(run("allBalance()"), -500);
});

test("a corrected amount can be applied to earlier copies, or kept as history", () => {
  const start = { rule: { type: "off", amount: 20 }, transactions: [tx("rent", { amount: 5000, date: offset(-70), frequency: "Monthly" })] };
  setData(start); run("expandRecurringTransactions()");
  run("confirm = () => true");
  assert.equal(run(`editTransaction(0, { ...data.transactions[0], amount: 500 })`), "copies");
  assert.ok(run("data.transactions.every(t => t.amount === 500)"));

  setData(start); run("expandRecurringTransactions()");
  run("confirm = () => false");
  assert.equal(run(`editTransaction(0, { ...data.transactions[0], amount: 500 })`), "updated");
  assert.ok(run("data.transactions.filter(t => t.generated).every(t => t.amount === 5000)"));
});

test("editing an income amount updates its automatic savings transfer", () => {
  setData({ accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 10000 }], rule: { type: "percent", amount: 20 }, transactions: [] });
  run(`data.transactions.push(${JSON.stringify(tx("pay", { type: "income", amount: 1000, category: "Salary" }))}); applySavingsRule(data.transactions[0])`);
  assert.equal(run(`data.transfers.find(t => t.id === "rule-pay").amount`), 200);
  run(`editTransaction(0, { ...data.transactions[0], amount: 500 })`);
  assert.equal(run(`data.transfers.find(t => t.id === "rule-pay").amount`), 100);
  assert.equal(run(`data.pots[0].saved`), 100);
  run(`editTransaction(0, { ...data.transactions[0], type: "expense", category: "Bills" })`);
  assert.equal(run(`data.transfers.length`), 0);
  assert.equal(run(`data.pots[0].saved`), 0);
});

test("income without a savings transfer is not given one just because it was edited", () => {
  setData({ rule: { type: "percent", amount: 20 }, accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 10000 }], transactions: [tx("old", { type: "income", amount: 1000, category: "Salary" })] });
  run(`editTransaction(0, { ...data.transactions[0], amount: 1200 })`);
  assert.equal(run("data.transfers.length"), 0);
});

test("future income is saved by the rule only when it arrives", () => {
  setData({ accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 0 }], rule: { type: "percent", amount: 10 }, transactions: [] });
  run(`data.transactions.push(${JSON.stringify(tx("pay", { type: "income", amount: 1000, category: "Salary", date: offset(2) }))}); applySavingsRule(data.transactions[0])`);
  assert.equal(run("data.transfers.length"), 0);
  assert.equal(run("data.transactions[0].pendingRule"), true);
  assert.equal(run("cleanData(data).transactions[0].pendingRule"), true, "the flag survives saving");
  run("unlocked = true"); moveTo(offset(2));
  assert.equal(run(`data.transfers.find(t => t.id === "rule-pay").amount`), 100);
  assert.equal(run("data.transactions[0].pendingRule"), false);
  assert.equal(run("allBalance()"), 900);
});

test("safe to spend sets aside bills still due this month", () => {
  const daysLeft = run("new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate()");
  if (daysLeft < 1) return; // last day of the month: nothing can still be due
  setData({ monthlyLimit: 1000, transactions: [tx("spent", { amount: 100 }), tx("bill", { amount: 300, date: offset(1) })] });
  run("render()");
  const card = document.querySelector("#safeCard").textContent;
  assert.match(card, /600\.00 MAD left this month/);
  assert.match(card, /Includes 300\.00 MAD of bills/);
});
