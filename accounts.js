/* Pennywise — multiple accounts (cash, bank, card) and transfers between them */

const accountKindLabels = { bank: "Bank account", cash: "Cash", card: "Credit card", other: "Other" };
const accountKindIcons = { bank: "savings", cash: "wallet", card: "bills", other: "overview" };
const signedMoney = value => (value < 0 ? "−" : "") + money(Math.abs(value));

function renderAccountsCard() {
  const menu = $("#accountsPopover"); if (!menu) return;
  const setAside = data.transfers.reduce((sum, t) => sum + t.amount, 0);
  const row = (icon, name, hint, amount, extra = "") => `<div class="pop-row${extra}"><span class="account-icon">${iconMarkup(icon)}</span><span class="pop-name"><strong>${h(name)}</strong>${hint ? `<small>${h(hint)}</small>` : ""}</span><strong class="pop-amount ${amount < 0 ? "expense" : ""}"><bdi dir="ltr">${h(signedMoney(amount))}</bdi></strong></div>`;
  $("#accountsLabel").textContent = data.accounts.length > 1 ? tr("{n} accounts", { n: data.accounts.length }) : tr(data.accounts[0].name);
  menu.innerHTML = `<div class="pop-head"><strong>${h(tr("Accounts"))}</strong></div>${data.accounts.map(a => row(accountKindIcons[a.kind], tr(a.name), tr(accountKindLabels[a.kind]), accountBalance(a.id))).join("")}${setAside ? row("goals", tr("Set aside in savings and goals"), "", -setAside, " pop-muted") : ""}<div class="pop-total"><span>${h(tr("Total balance"))}</span><strong><bdi dir="ltr">${h(signedMoney(allBalance()))}</bdi></strong></div><div class="pop-actions">${data.accounts.length > 1 ? `<button class="secondary-btn" type="button" data-open-accounts="transfer">${h(tr("Transfer"))}</button>` : ""}<button class="secondary-btn" type="button" data-open-accounts>${h(tr("Manage accounts"))}</button></div>`;
}
function fillSelect(selector, items, { blank } = {}) {
  const el = $(selector); if (!el) return; const old = el.value;
  el.innerHTML = (blank ? `<option value="">${h(tr(blank))}</option>` : "") + items.map(a => `<option value="${h(a.id)}">${h(tr(a.name))}</option>`).join("");
  el.value = [...el.options].some(o => o.value === old) ? old : (el.options[0]?.value ?? "");
}

function renderAccountFilters() {
  const many = data.accounts.length > 1;
  fillSelect("#filterAccount", data.accounts, { blank: "All accounts" }); $("#filterAccount").hidden = !many;
  fillSelect("#csvAccount", data.accounts); $("#csvAccountLabel").hidden = !many;
}

function renderAccountEditor() {
  const only = data.accounts.length < 2;
  $("#accountEditor").innerHTML = data.accounts.map(a => {
    const kinds = accountKinds.map(kind => `<option value="${kind}"${kind === a.kind ? " selected" : ""}>${h(tr(accountKindLabels[kind]))}</option>`).join("");
    return `<div class="acct-row" data-id="${h(a.id)}"><span class="account-icon">${iconMarkup(accountKindIcons[a.kind])}</span><input class="acct-name" data-acct-name value="${h(tr(a.name))}" maxlength="40" aria-label="${h(tr("Account name"))}"><select data-acct-kind aria-label="${h(tr("Account type"))}">${kinds}</select><input class="acct-opening" type="number" step="0.01" data-acct-opening value="${h(a.opening)}" aria-label="${h(tr("Opening balance"))}" title="${h(tr("Opening balance"))}"><strong class="acct-balance"><bdi dir="ltr">${h(signedMoney(accountBalance(a.id)))}</bdi></strong><button type="button" class="text-btn" data-acct-delete${only ? " disabled" : ""}>${h(tr("Delete"))}</button></div>`;
  }).join("");
  const form = $("#accountTransferForm"); form.hidden = $("#transferHeading").hidden = only;
  if (!only) {
    const from = $("#atFrom").value, to = $("#atTo").value;
    fillSelect("#atFrom", data.accounts); fillSelect("#atTo", data.accounts);
    if (!from || from === to || $("#atFrom").value === $("#atTo").value) $("#atTo").value = data.accounts.find(a => a.id !== $("#atFrom").value).id;
    if (!$("#atDate").value) $("#atDate").value = dateKey(today);
  }
  const rows = [...data.accountTransfers].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 10).map(t =>
    `<div class="log-row"><span class="log-date">${h(dateAtNoon(t.date).toLocaleDateString(locale(), { month: "short", day: "numeric" }))}</span><span class="log-label">${h(tr("{a} → {b}", { a: accountLabel(t.from), b: accountLabel(t.to) }))}${t.note ? ` · ${h(t.note)}` : ""}</span><strong><bdi dir="ltr">${h(money(t.amount))}</bdi></strong><button type="button" class="text-btn" data-at-delete="${h(t.id)}">${h(tr("Delete"))}</button></div>`).join("");
  $("#accountTransferLog").innerHTML = rows;
}

function renderAccounts() {
  renderAccountsCard(); renderAccountFilters();
  if ($("#accountsModal").classList.contains("open")) renderAccountEditor();
}

function openAccounts(focusTransfer) {
  renderAccountEditor(); openOnly("#accountsModal");
  if (focusTransfer && data.accounts.length > 1) $("#atAmount").focus();
}

document.addEventListener("click", event => {
  const opener = event.target.closest("[data-open-accounts]"); if (opener) openAccounts(opener.dataset.openAccounts === "transfer");
});
$("#openAccountsBtn").onclick = () => openAccounts(false);

$("#newAccountForm").onsubmit = event => {
  event.preventDefault(); const name = $("#newAccountName").value.trim().slice(0, 40); if (!name) return;
  if (data.accounts.some(a => a.name.toLowerCase() === name.toLowerCase() || tr(a.name).toLowerCase() === name.toLowerCase())) { toast("An account with that name already exists.", "error"); return; }
  if (data.accounts.length >= 12) { toast("You can have up to 12 accounts.", "error"); return; }
  pushUndo();
  data.accounts.push({ id: `account-${Date.now()}`, name, kind: accountKinds.includes($("#newAccountKind").value) ? $("#newAccountKind").value : "bank", opening: number($("#newAccountOpening").value) });
  event.target.reset(); refreshAll(); renderAccountEditor(); toast("Account added.", "success", { undo: true });
};

$("#accountEditor").addEventListener("change", event => {
  const row = event.target.closest(".acct-row"); const account = row && data.accounts.find(a => a.id === row.dataset.id); if (!account) return;
  if (event.target.matches("[data-acct-name]")) {
    const next = event.target.value.trim().slice(0, 40);
    if (!next || next === account.name || next === tr(account.name)) { renderAccountEditor(); return; }
    if (data.accounts.some(a => a !== account && (a.name.toLowerCase() === next.toLowerCase() || tr(a.name).toLowerCase() === next.toLowerCase()))) { toast("An account with that name already exists.", "error"); renderAccountEditor(); return; }
    pushUndo(); account.name = next;
  } else if (event.target.matches("[data-acct-kind]")) {
    if (!accountKinds.includes(event.target.value)) return; pushUndo(); account.kind = event.target.value;
  } else if (event.target.matches("[data-acct-opening]")) {
    pushUndo(); account.opening = number(event.target.value);
  } else return;
  refreshAll(); renderAccountEditor(); toast("Account updated.", "success", { undo: true });
});

$("#accountEditor").addEventListener("click", event => {
  const row = event.target.closest(".acct-row"); if (!row || !event.target.closest("[data-acct-delete]")) return;
  const id = row.dataset.id; const removed = data.accounts.find(a => a.id === id); const target = data.accounts.find(a => a.id !== id);
  if (!removed || !target) { toast("You need at least one account.", "error"); return; }
  pushUndo();
  data.transactions.forEach(t => { if (t.account === id) t.account = target.id; });
  target.opening += removed.opening;
  data.accountTransfers = data.accountTransfers.map(t => ({ ...t, from: t.from === id ? target.id : t.from, to: t.to === id ? target.id : t.to })).filter(t => t.from !== t.to);
  data.accounts = data.accounts.filter(a => a.id !== id);
  refreshAll(); renderAccountEditor(); toast("Account deleted. Its transactions moved to another account.", "success", { undo: true });
});

$("#accountTransferForm").onsubmit = event => {
  event.preventDefault();
  const from = $("#atFrom").value, to = $("#atTo").value, amount = number($("#atAmount").value), date = $("#atDate").value;
  if (!data.accounts.some(a => a.id === from) || !data.accounts.some(a => a.id === to)) { toast("Choose two accounts.", "error"); return; }
  if (from === to) { toast("Choose two different accounts.", "error"); return; }
  if (!(amount > 0) || !date || dateAtNoon(date).toString() === "Invalid Date") { toast("Enter a valid amount and date."); return; }
  pushUndo();
  data.accountTransfers.push({ id: `at-${Date.now()}`, from, to, amount: Math.round(amount * 100) / 100, date, note: $("#atNote").value.trim().slice(0, 120) });
  $("#atAmount").value = ""; $("#atNote").value = ""; refreshAll(); renderAccountEditor(); toast("Transfer saved.", "success", { undo: true });
};

$("#accountTransferLog").addEventListener("click", event => {
  const button = event.target.closest("[data-at-delete]"); if (!button) return;
  pushUndo(); data.accountTransfers = data.accountTransfers.filter(t => t.id !== button.dataset.atDelete);
  refreshAll(); renderAccountEditor(); toast("Transfer deleted.", "success", { undo: true });
});
