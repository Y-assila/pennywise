const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./load-app");

const app = loadApp();
const { document } = app;
const run = code => { const value = app.run(code); return value !== null && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value; };
const setData = obj => run(`data = cleanData(${JSON.stringify(obj)}); syncCategories();`);
const tx = (id, account, type, amount) => ({ id, account, type, amount, date: "2025-01-10", category: "Other" });
const two = { accounts: [{ id: "a", name: "Wallet", kind: "cash", opening: 100 }, { id: "b", name: "Bank", kind: "bank", opening: 1000 }] };
const submit = selector => document.querySelector(selector).dispatchEvent(new app.window.Event("submit", { cancelable: true, bubbles: true }));

test("old data without accounts gets one default account holding every transaction", () => {
  setData({ transactions: [tx("1", undefined, "income", 50), tx("2", "ghost", "expense", 20)] });
  assert.deepEqual(run("data.accounts"), [{ id: "main", name: "Main account", kind: "bank", opening: 0 }]);
  assert.deepEqual(run("data.transactions.map(t => t.account)"), ["main", "main"]);
  assert.equal(run("allBalance()"), 30);
  assert.equal(run(`accountBalance("main")`), 30);
});

test("cleanData repairs accounts and drops invalid transfers", () => {
  setData({
    accounts: [{ id: "a", name: " Wallet ", kind: "weird", opening: "5" }, { id: "a", name: "Duplicate id" }, { id: "b", name: "", opening: -20 }],
    accountTransfers: [{ id: "t1", from: "a", to: "b", amount: 10, date: "2025-01-01" }, { id: "t2", from: "a", to: "a", amount: 5 }, { id: "t3", from: "a", to: "zzz", amount: 5 }, { id: "t4", from: "b", to: "a", amount: -3 }]
  });
  assert.deepEqual(run("data.accounts.map(a => [a.id, a.name, a.kind, a.opening])"), [["a", "Wallet", "bank", 5], ["b", "Account", "bank", -20]]);
  assert.deepEqual(run("data.accountTransfers.map(t => t.id)"), ["t1"]);
});

test("account balances include opening balance and transfers, and always add up to the total", () => {
  setData({ ...two, transactions: [tx("1", "a", "expense", 30), tx("2", "b", "income", 500)], accountTransfers: [{ id: "t", from: "b", to: "a", amount: 200, date: "2025-01-11" }] });
  assert.equal(run(`accountBalance("a")`), 270);
  assert.equal(run(`accountBalance("b")`), 1300);
  assert.equal(run("allBalance()"), 1570);
  assert.equal(run(`accountBalance("a") + accountBalance("b")`), run("allBalance()"));
});

test("savings moves reduce the total balance but not the account split", () => {
  setData({ ...two, transfers: [{ id: "s", amount: 150, date: "2025-01-12", destination: "pot:x" }] });
  assert.equal(run("allBalance()"), 950);
  assert.equal(run(`accountBalance("a") + accountBalance("b")`), 1100);
});

test("account UI: add, transfer, rename and delete keep the total balance", () => {
  setData({ ...two, transactions: [tx("1", "a", "expense", 30)] });
  run(`render(); openAccounts(false)`);
  const total = run("allBalance()");
  assert.match(document.querySelector("#accountsPopover").textContent, /Wallet/);

  document.querySelector("#atFrom").value = "b"; document.querySelector("#atTo").value = "a";
  document.querySelector("#atAmount").value = "250"; document.querySelector("#atDate").value = "2025-02-01";
  submit("#accountTransferForm");
  assert.equal(run("data.accountTransfers.length"), 1);
  assert.equal(run(`accountBalance("b")`), 750);
  assert.equal(run("allBalance()"), total);

  document.querySelector("#newAccountName").value = "Card"; document.querySelector("#newAccountKind").value = "card"; document.querySelector("#newAccountOpening").value = "-40";
  submit("#newAccountForm");
  assert.equal(run("data.accounts.length"), 3);
  assert.equal(run("allBalance()"), total - 40);

  const nameInput = document.querySelector('.acct-row[data-id="a"] [data-acct-name]'); nameInput.value = "Pocket";
  nameInput.dispatchEvent(new app.window.Event("change", { bubbles: true }));
  assert.equal(run(`data.accounts.find(a => a.id === "a").name`), "Pocket");

  const before = run("allBalance()");
  document.querySelector('.acct-row[data-id="a"] [data-acct-delete]').click();
  assert.equal(run("data.accounts.length"), 2);
  assert.equal(run("allBalance()"), before, "deleting an account must not change the total");
  assert.equal(run(`data.transactions.every(t => data.accounts.some(a => a.id === t.account))`), true);
  assert.equal(run(`data.accountTransfers.every(t => t.from !== t.to)`), true);
});

test("the last account cannot be deleted", () => {
  setData({});
  run(`render(); openAccounts(false)`);
  assert.equal(document.querySelector("[data-acct-delete]").disabled, true);
});

test("new transactions are saved to the chosen account", () => {
  setData({ ...two });
  run(`render(); startTransaction()`);
  assert.equal(document.querySelector("#accountLabel").hidden, false);
  document.querySelector("#account").value = "b"; document.querySelector("#amount").value = "40";
  submit("#transactionForm");
  assert.equal(run(`data.transactions.filter(t => t.account === "b").length`), 1);
  assert.equal(run(`accountBalance("b")`), 960);
});

test("the account selectors stay hidden with a single account", () => {
  setData({});
  run("render()");
  assert.equal(document.querySelector("#accountLabel").hidden, true);
  assert.equal(document.querySelector("#filterAccount").hidden, true);
});
