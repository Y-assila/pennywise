const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const offset = days => run(`dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (${days}), 12))`);
const setData = obj => run(`data = cleanData(${JSON.stringify(obj)}); syncCategories();`);
const bill = (id, extra) => ({ id, type: "expense", amount: 10, category: "Bills", notes: id, frequency: "One-time", ...extra });
const names = horizon => run(`upcomingItems(${horizon}).map(i => i.name + "@" + i.date)`);

test("future one-time items are upcoming, past and out-of-range ones are not", () => {
  setData({ transactions: [bill("soon", { date: offset(3) }), bill("later", { date: offset(50) }), bill("past", { date: offset(-3) }), bill("today", { date: offset(0) })] });
  assert.deepEqual(names(30), [`soon@${offset(3)}`]);
  assert.deepEqual(names(60), [`soon@${offset(3)}`, `later@${offset(50)}`]);
});

test("weekly and monthly items list every coming occurrence", () => {
  setData({ transactions: [bill("gym", { date: offset(-100), frequency: "Weekly" }), bill("rent", { date: offset(-400), frequency: "Monthly" })] });
  const items = run("upcomingItems(30)");
  const weekly = items.filter(i => i.name === "gym"), monthly = items.filter(i => i.name === "rent");
  assert.ok(weekly.length >= 4 && weekly.length <= 5, `weekly count ${weekly.length}`);
  assert.ok(weekly.every((i, n) => n === 0 || run(`dayDiff("${i.date}") - dayDiff("${weekly[n - 1].date}")`) === 7));
  assert.ok(monthly.length >= 1 && monthly.length <= 2, `monthly count ${monthly.length}`);
  assert.ok(items.every(i => i.date >= offset(0) && i.date <= offset(30)));
});

test("a weekly item from years ago is still found", () => {
  setData({ transactions: [bill("old", { date: offset(-3000), frequency: "Weekly" })] });
  assert.ok(run("upcomingItems(14).length") >= 2);
});

test("paused, ended and not-yet-resumed items are skipped", () => {
  setData({ transactions: [
    bill("paused", { date: offset(-30), frequency: "Weekly", paused: true }),
    bill("ended", { date: offset(-30), frequency: "Weekly", endDate: offset(-1) }),
    bill("resumes", { date: offset(-30), frequency: "Weekly", resumeFrom: offset(20) })
  ] });
  const items = run("upcomingItems(30)");
  assert.deepEqual([...new Set(items.map(i => i.name))], ["resumes"]);
  assert.ok(items.every(i => i.date >= offset(20)));
});

test("generated occurrences are not listed twice", () => {
  setData({ rule: { type: "off", amount: 20 }, transactions: [bill("rent", { date: offset(-65), frequency: "Monthly" })] });
  run("expandRecurringTransactions()");
  const dates = run("upcomingItems(60).map(i => i.date)");
  assert.equal(new Set(dates).size, dates.length);
  assert.ok(dates.every(date => date >= offset(0)));
});

test("items are sorted by date and the upcoming menu shows the soonest ones", () => {
  setData({ transactions: [bill("c", { date: offset(9) }), bill("a", { date: offset(1) }), bill("b", { date: offset(5) }), bill("d", { date: offset(12) }), bill("e", { date: offset(14) })] });
  assert.deepEqual(run("upcomingItems(30).map(i => i.name)"), ["a", "b", "c", "d", "e"]);
  run("render()");
  const rows = [...document.querySelectorAll("#upcomingPopover .upcoming-row")];
  assert.equal(rows.length, 5);
  assert.ok(rows[0].classList.contains("soon"), "tomorrow is inside the default 3-day reminder window");
  assert.equal(rows[3].classList.contains("soon"), false);
});

test("the bell badge counts bills inside the reminder window", () => {
  setData({});
  run("render()");
  assert.equal(document.querySelector("#bellBadge").hidden, true);
  assert.equal(document.querySelectorAll("#upcomingPopover .upcoming-row").length, 0);
  setData({ transactions: [bill("a", { date: offset(1) }), bill("b", { date: offset(2) }), bill("c", { date: offset(20) })] });
  run("render()");
  assert.equal(document.querySelector("#bellBadge").hidden, false);
  assert.equal(document.querySelector("#bellBadge").textContent, "2");
});

test("reminder window and horizon can be changed and are validated", () => {
  setData({ transactions: [bill("x", { date: offset(6) })], settings: { reminderDays: 99 } });
  assert.equal(run("data.settings.reminderDays"), 3);
  run("render(); openUpcoming()");
  const select = document.querySelector("#reminderDays");
  select.value = "7"; select.dispatchEvent(new app.window.Event("change", { bubbles: true }));
  assert.equal(run("data.settings.reminderDays"), 7);
  assert.ok(document.querySelector("#upcomingPopover .upcoming-row").classList.contains("soon"));
  const horizon = document.querySelector("#upcomingHorizon");
  horizon.value = "7"; horizon.dispatchEvent(new app.window.Event("change", { bubbles: true }));
  assert.equal(document.querySelectorAll("#upcomingList .upcoming-item").length, 1);
  horizon.value = "30"; horizon.dispatchEvent(new app.window.Event("change", { bubbles: true }));
});

test("monthly cost summary converts weekly items and singles out subscriptions", () => {
  setData({ transactions: [bill("rent", { date: offset(-5), frequency: "Monthly", amount: 100 }), bill("netflix", { date: offset(-5), frequency: "Monthly", amount: 12, category: "Subscriptions" }), bill("gym", { date: offset(-5), frequency: "Weekly", amount: 12 })] });
  const costs = run("recurringCosts()");
  assert.equal(costs.subscriptions, 12);
  assert.ok(Math.abs(costs.all - (100 + 12 + 52)) < 1e-9);
});
