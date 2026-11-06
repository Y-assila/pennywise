const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const setData = obj => run(`data = cleanData(${JSON.stringify(obj)}); syncCategories();`);
const monthDay = day => run(`dateKey(new Date(today.getFullYear(), today.getMonth(), ${day}, 12))`);

test("cleanData drops invalid transactions and repairs fields", () => {
  const d = JSON.parse(run(`JSON.stringify(cleanData({
    transactions: [
      { id: "a", type: "income", amount: "100", date: "2025-01-05", category: "Salary" },
      { id: "b", type: "weird", amount: 20, date: "not-a-date", category: "" },
      { id: "c", type: "expense", amount: 0, date: "2025-01-05" },
      { id: "d", type: "expense", amount: -4, date: "2025-01-05" },
      { id: "e", type: "expense", amount: 9, date: "2025-01-06", category: "Brand new", frequency: "Yearly", tags: "a, b ,," }
    ],
    settings: { currency: "XYZ", language: "de" }
  }))`));
  assert.deepEqual(d.transactions.map(t => t.id), ["a", "b", "e"]);
  assert.equal(d.transactions[1].type, "expense");
  assert.equal(d.transactions[1].category, "Other");
  assert.match(d.transactions[1].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(d.transactions[2].frequency, "One-time");
  assert.deepEqual(d.transactions[2].tags, ["a", "b"]);
  assert.ok(d.categories.expense.some(c => c.name === "Brand new"), "unknown categories are created");
  assert.ok(d.categories.expense.some(c => c.name === "Other") && d.categories.income.some(c => c.name === "Other"));
  assert.equal(d.settings.currency, "MAD");
  assert.equal(d.settings.language, "en");
});

test("cleanData tolerates garbage input", () => {
  for (const input of [null, undefined, "x", 42, [], { transactions: "nope", goals: 5, pots: {}, budgets: null }]) {
    const d = run(`cleanData(${JSON.stringify(input) ?? "undefined"})`);
    assert.equal(d.transactions.length, 0);
    assert.ok(d.categories.expense.length > 0);
  }
});

test("cleanData clamps goals, pots, budgets and the savings rule", () => {
  const d = JSON.parse(run(`JSON.stringify(cleanData({
    goals: [{ name: "Trip", target: -5, saved: -1, deadline: "2030-01-01" }],
    pots: [{ name: "P", target: 0, saved: 10, color: "pink" }],
    budgets: [{ category: "Food", amount: 100 }, { category: "Fun", amount: 0 }],
    rule: { amount: 0, type: "weird" }, monthlyLimit: -3
  }))`));
  assert.equal(d.goals[0].target, 1); assert.equal(d.goals[0].saved, 0);
  assert.equal(d.pots[0].color, "teal"); assert.equal(d.pots[0].target, 1);
  assert.deepEqual(d.budgets, [{ category: "Food", amount: 100 }]);
  assert.deepEqual(d.rule, { amount: 20, type: "percent" });
  assert.equal(d.monthlyLimit, 0);
});

test("parseAmount handles common bank formats", () => {
  const cases = [["1 234,56", 1234.56], ["1,234.56", 1234.56], ["1.234,56", 1234.56], ["-5", -5], ["(12.50)", -12.5], ["12,50 DH", 12.5], ["1,234", 1234], ["1.234.567", 1234567], ["12-", -12]];
  for (const [raw, expected] of cases) assert.equal(run(`parseAmount(${JSON.stringify(raw)})`), expected, raw);
  for (const raw of ["", "abc", null]) assert.ok(Number.isNaN(run(`parseAmount(${JSON.stringify(raw)})`)), String(raw));
});

test("parseCsvDate respects the chosen format and rejects impossible dates", () => {
  assert.equal(run(`parseCsvDate("31/12/2025", "auto")`), "2025-12-31");
  assert.equal(run(`parseCsvDate("12/31/2025", "auto")`), "2025-12-31");
  assert.equal(run(`parseCsvDate("03/04/2025", "dmy")`), "2025-04-03");
  assert.equal(run(`parseCsvDate("03/04/2025", "mdy")`), "2025-03-04");
  assert.equal(run(`parseCsvDate("2025-02-28 10:00", "auto")`), "2025-02-28");
  assert.equal(run(`parseCsvDate("05.06.25", "dmy")`), "2025-06-05");
  assert.equal(run(`parseCsvDate("31/02/2025", "dmy")`), null);
  assert.equal(run(`parseCsvDate("hello", "auto")`), null);
});

test("parseCSV detects delimiters and handles quotes and BOM", () => {
  assert.deepEqual(run(`parseCSV("\\ufeffDate;Libellé;Montant\\r\\n01/02/2025;\\"Café; bar\\";-12,50\\n")`), [["Date", "Libellé", "Montant"], ["01/02/2025", "Café; bar", "-12,50"]]);
  assert.deepEqual(run(`parseCSV('a,b\\n"he said ""hi""",2\\n\\n')`), [["a", "b"], ['he said "hi"', "2"]]);
  assert.deepEqual(run(`parseCSV("a\\tb\\n1\\t2")`), [["a", "b"], ["1", "2"]]);
});

test("guessCategory prefers the CSV column, then keywords, then the fallback", () => {
  setData({});
  assert.equal(run(`guessCategory("expense", "whatever", "health", "Other")`), "Health");
  assert.equal(run(`guessCategory("expense", "UBER trip", "", "Other")`), "Transport");
  assert.equal(run(`guessCategory("income", "Salaire mars", "", "Other")`), "Salary");
  assert.equal(run(`guessCategory("expense", "zzz", "", "Other")`), "Other");
});

test("CSV import maps debit/credit columns, skips bad rows and de-duplicates", () => {
  setData({ transactions: [{ id: "x", type: "expense", amount: 15, date: "2025-03-02", category: "Food", notes: "Marjane" }] });
  run(`csvState.header = ["Date", "Libellé", "Débit", "Crédit"]; csvState.rows = [
    ["01/03/2025", "Salaire", "", "5 000,00"],
    ["02/03/2025", "Marjane", "15,00", ""],
    ["03/03/2025", "Uber", "30,00", ""],
    ["03/03/2025", "Uber", "30,00", ""],
    ["99/99/2025", "Broken", "1,00", ""],
    ["04/03/2025", "Nothing", "", ""]
  ];`);
  const set = (id, html, value) => { const el = document.querySelector(id); el.innerHTML = html; el.value = value; };
  const opts = '<option value="">none</option><option value="0">a</option><option value="1">b</option><option value="2">c</option><option value="3">d</option>';
  set("#mapDate", opts, "0"); set("#mapDesc", opts, "1"); set("#mapDebit", opts, "2"); set("#mapCredit", opts, "3"); set("#mapAmount", opts, ""); set("#mapCategory", opts, "");
  set("#csvExpenseCat", '<option value="Other">Other</option>', "Other"); set("#csvIncomeCat", '<option value="Other">Other</option>', "Other");
  const result = run(`csvCandidates()`);
  assert.equal(result.invalid, false);
  assert.equal(result.duplicates, 2, "one existing + one repeated row");
  assert.equal(result.skipped, 2);
  assert.deepEqual(result.out.map(t => [t.date, t.type, t.amount, t.category]), [["2025-03-01", "income", 5000, "Salary"], ["2025-03-03", "expense", 30, "Transport"]]);
});

test("recurringDate clamps month ends and steps weeks", () => {
  const date = (frequency, start, n) => run(`dateKey(recurringDate({ frequency: "${frequency}", date: "${start}" }, ${n}))`);
  assert.equal(date("Monthly", "2025-01-31", 1), "2025-02-28");
  assert.equal(date("Monthly", "2025-01-31", 2), "2025-03-31");
  assert.equal(date("Monthly", "2024-01-31", 1), "2024-02-29");
  assert.equal(date("Monthly", "2025-11-15", 3), "2026-02-15");
  assert.equal(date("Weekly", "2025-01-01", 2), "2025-01-15");
});

test("recurring transactions are generated once, skip paused sources and respect end dates", () => {
  const start = run(`dateKey(new Date(today.getFullYear(), today.getMonth() - 3, 1, 12))`);
  setData({ rule: { type: "off", amount: 20 }, transactions: [
    { id: "rent", type: "expense", amount: 100, date: start, category: "Rent", frequency: "Monthly" },
    { id: "paused", type: "expense", amount: 5, date: start, category: "Bills", frequency: "Monthly", paused: true },
    { id: "ended", type: "expense", amount: 7, date: start, category: "Bills", frequency: "Monthly", endDate: start }
  ] });
  run("expandRecurringTransactions()");
  const generated = id => run(`data.transactions.filter(t => t.sourceId === "${id}").length`);
  assert.equal(generated("rent"), 3);
  assert.equal(generated("paused"), 0);
  assert.equal(generated("ended"), 0);
  run("expandRecurringTransactions()");
  assert.equal(generated("rent"), 3, "running again must not duplicate");
  assert.equal(run(`data.transactions.filter(t => t.generated && t.date > dateKey(today)).length`), 0, "never generates future dates");
});

test("savings rule moves money into the emergency pot and keeps the balance consistent", () => {
  setData({ rule: { type: "percent", amount: 20 } });
  run(`data.transactions.push({ id: "inc", type: "income", amount: 1000, date: dateKey(today), category: "Salary", payment: "Cash", frequency: "One-time", notes: "", tags: [], generated: false, sourceId: null, occurrence: null }); applySavingsRule(data.transactions[0]); applySavingsRule(data.transactions[0]);`);
  assert.equal(run("data.transfers.length"), 1, "rule applies once per income");
  assert.equal(run("data.pots[0].saved"), 200);
  assert.equal(run("allBalance()"), 800);
  run(`removeAutoTransfer("inc")`);
  assert.equal(run("data.pots[0].saved"), 0);
  assert.equal(run("allBalance()"), 1000);
});

test("savings rule never saves more than the available balance", () => {
  setData({ rule: { type: "fixed", amount: 500 } });
  run(`data.transactions.push({ id: "inc", type: "income", amount: 100, date: dateKey(today), category: "Salary", payment: "Cash", frequency: "One-time", notes: "", tags: [], generated: false, sourceId: null, occurrence: null }); applySavingsRule(data.transactions[0]);`);
  assert.equal(run("data.transfers[0].amount"), 100);
  assert.ok(run("allBalance()") >= 0);
});

test("goalStatus flags completed and overdue goals", () => {
  const status = goal => run(`goalStatus(${JSON.stringify(goal)}).status`);
  assert.equal(status({ target: 100, saved: 100, deadline: "2030-01-01", created: "2029-01-01" }), "Complete");
  assert.equal(status({ target: 100, saved: 10, deadline: "2000-01-01", created: "1999-01-01" }), "Past due");
  assert.equal(status({ target: 100, saved: 50, deadline: "2099-01-01", created: "2000-01-01" }), "On track");
  assert.equal(status({ target: 100, saved: 0, deadline: "2099-01-01", created: "2000-01-01" }), "Catch up");
});

test("percentChange and totals", () => {
  assert.equal(run("percentChange(150, 100)"), 50);
  assert.equal(run("percentChange(5, 0)"), 100);
  assert.equal(run("percentChange(0, 0)"), 0);
  assert.deepEqual(run(`totals([{ type: "income", amount: 3 }, { type: "expense", amount: 1 }, { type: "expense", amount: 2 }])`), { income: 3, expense: 3 });
});

test("monthly report totals, categories and savings rate", () => {
  setData({ rule: { type: "off", amount: 20 }, transactions: [
    { id: "i", type: "income", amount: 2000, date: monthDay(1), category: "Salary" },
    { id: "f", type: "expense", amount: 300, date: monthDay(1), category: "Food" },
    { id: "r", type: "expense", amount: 700, date: monthDay(1), category: "Rent" }
  ], budgets: [{ category: "Food", amount: 200 }] });
  const rep = JSON.parse(run(`JSON.stringify(buildReport("month"))`));
  assert.equal(rep.tot.income, 2000); assert.equal(rep.tot.expense, 1000); assert.equal(rep.net, 1000);
  assert.equal(rep.rate, 0.5);
  assert.deepEqual(rep.categories.map(c => c.name), ["Rent", "Food"]);
  assert.equal(rep.count, 3);
  assert.equal(rep.budgets[0].spent, 300);
  assert.ok(rep.insights.some(text => /over its budget/.test(text)));
});

test("report handles an empty profile for every period", () => {
  setData({});
  for (const period of ["month", "week", "quarter", "half", "ytd", "year", "custom"]) {
    const rep = run(`buildReport("${period}")`);
    assert.equal(rep.count, 0, period);
    assert.equal(rep.rate, null, period);
  }
});

test("rendering works with data in every language", () => {
  setData({ transactions: [{ id: "i", type: "income", amount: 2000, date: monthDay(1), category: "Salary" }], goals: [{ name: "Trip", target: 500, saved: 50, deadline: "2099-01-01" }], pots: [{ name: "Pot", target: 100, saved: 10 }], budgets: [{ category: "Food", amount: 10 }] });
  for (const code of ["en", "fr", "ar"]) {
    run(`setLanguage("${code}", false); render(); renderReports();`);
    assert.match(document.querySelector("#totalBalance").textContent, /\d/, code);
  }
  assert.equal(document.documentElement.dir, "rtl");
  run(`setLanguage("en", false)`);
  assert.equal(document.documentElement.dir, "ltr");
});
