const incomeCategories = ["Salary", "Freelance", "Gifts", "Refunds", "Bonuses", "Investments", "Other"];
const expenseCategories = ["Rent", "Food", "Transport", "Bills", "Entertainment", "Health", "Debt payments", "Subscriptions", "Shopping", "Other"];
const categoryColors = { Rent: "#167d72", Food: "#ee785e", Transport: "#f3ba4d", Bills: "#8a78c7", Entertainment: "#7fb9ad", Health: "#d98b70", "Debt payments": "#ad9bda", Subscriptions: "#77a08e", Shopping: "#f0a35a", Other: "#b7c4bd" };
const icons = { Rent: "home", Food: "food", Transport: "transport", Bills: "bills", Entertainment: "sparkles", Health: "health", "Debt payments": "arrowDown", Subscriptions: "savings", Shopping: "shopping", Other: "overview", Salary: "arrowUpRight", Freelance: "pencil", Gifts: "gift", Refunds: "arrowDown", Bonuses: "sparkles", Investments: "arrowUpRight" };
const iconMarkup = name => typeof pennywiseIcon === "function" ? pennywiseIcon(name) : "";
const seed = { transactions: [], transfers: [], goals: [], pots: [], budgets: [], rule: { amount: 20, type: "percent" }, settings: { name: "", currency: "MAD", language: "en" } };
const storageVersion = 3;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const today = new Date();
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthKey = dateKey(today).slice(0, 7);
const h = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value))} ${data.settings.currency || "MAD"}`;
const dateAtNoon = value => new Date(`${value}T12:00:00`);
const databaseName = "pennywise-db";
const databaseVersion = 1;
let activeProfile = null;
let databasePromise;
function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "username" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB could not be opened."));
  });
  return databasePromise;
}
async function getProfile(username) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction("profiles", "readonly").objectStore("profiles").get(username);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Profile could not be read."));
  });
}
async function putProfile(profile) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction("profiles", "readwrite").objectStore("profiles").put(profile);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Profile could not be saved."));
  });
}
const profileKey = value => String(value || "").trim().toLocaleLowerCase();
const save = async () => {
  if (!activeProfile) return;
  activeProfile.data = cleanData(data);
  try { await putProfile(activeProfile); } catch (error) { console.warn("Pennywise data could not be saved to IndexedDB.", error); toast("Could not save your latest change."); }
};
const toast = message => { const node = $("#toast"); if (node) { node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2600); } };
let unlocked = false;

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, key, 256);
}

async function passwordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = new Uint8Array(await derivePassword(password, salt));
  return { salt: bytesToBase64(salt), hash: bytesToBase64(hash), algorithm: "PBKDF2-SHA-256", iterations: 310000 };
}

async function passwordMatches(password, record) {
  const hash = new Uint8Array(await derivePassword(password, base64ToBytes(record.salt)));
  const expected = base64ToBytes(record.hash);
  return hash.length === expected.length && hash.every((byte, index) => byte === expected[index]);
}

function showAuth(mode, message = "") {
  const setup = mode === "setup";
  $("#authEyebrow").textContent = setup ? "PRIVATE LOCAL FINANCE APP" : "APP LOCKED";
  $("#authTitle").textContent = setup ? "Create your password" : "Welcome back";
  $("#authDescription").textContent = setup ? "Choose a password to protect this browser’s local finance data." : "Enter your local password to unlock your finance tracker.";
  $("#authConfirmLabel").hidden = !setup;
  $("#authNameLabel").hidden = false;
  $("#authConfirm").required = setup;
  $("#authPassword").autocomplete = setup ? "new-password" : "current-password";
  $("#authSubmit").textContent = setup ? "Create password" : "Unlock app";
  $("#authError").textContent = message;
  $("#resetPasswordBtn").hidden = setup || !message;
  $("#authForm").reset();
}

async function unlockApp() {
  data = cleanData(activeProfile?.data || seed);
  data.settings.name = activeProfile?.name || data.settings.name;
  unlocked = true;
  document.body.classList.add("app-unlocked");
  expandRecurringTransactions();
  render();
}

async function initAuth() {
  if (!window.crypto?.subtle) {
    showAuth("setup", "This browser does not support the secure password storage required by the app.");
    $("#authSubmit").disabled = true;
    return;
  }
  let profileExists = false;
  try {
    const database = await openDatabase();
    profileExists = await new Promise((resolve, reject) => {
      const request = database.transaction("profiles", "readonly").objectStore("profiles").count();
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error || new Error("Profiles could not be read."));
    });
  } catch (error) {
    console.warn("IndexedDB initialization failed.", error);
    showAuth("setup", "Secure local storage could not be opened in this browser.");
    $("#authSubmit").disabled = true;
    return;
  }
  showAuth(profileExists ? "login" : "setup");
  $("#authForm").onsubmit = async event => {
    event.preventDefault();
    const username = profileKey($("#authName").value);
    const password = $("#authPassword").value;
    const confirmPassword = $("#authConfirm").value;
    if (!username) return showAuth(profileExists ? "login" : "setup", "Enter your profile name.");
    if (password.length < 8) return showAuth(profileExists ? "login" : "setup", "Use at least 8 characters.");
    let record;
    try {
      record = await getProfile(username);
    } catch (error) {
      console.warn("Profile lookup failed.", error);
      return showAuth(profileExists ? "login" : "setup", "Your local profile could not be opened.");
    }
    if (profileExists && !record) return showAuth("login", "Profile not found.");
    if (!record && password !== confirmPassword) return showAuth("setup", "Passwords do not match.");
    try {
      if (record) {
        if (!await passwordMatches(password, record.password)) return showAuth("login", "Incorrect password.");
      } else {
        activeProfile = { username, name: $("#authName").value.trim().slice(0, 80), password: await passwordRecord(password), data: cleanData(seed) };
        profileExists = true;
        await putProfile(activeProfile);
      }
      activeProfile = record || activeProfile;
      await unlockApp();
    } catch (error) {
      console.warn("Local authentication failed.", error);
      showAuth(record ? "login" : "setup", "Authentication could not be completed.");
    }
  };
  $("#resetPasswordBtn").onclick = () => {
    toast("To protect your data, password recovery is not available. Use the correct profile password.");
  };
}

async function changePassword() {
  const current = prompt("Enter your current local password.");
  if (current === null) return;
  if (!activeProfile || !await passwordMatches(current, activeProfile.password)) return toast("Current password is incorrect.");
  const next = prompt("Enter a new password (at least 8 characters).");
  if (next === null) return;
  const confirmation = prompt("Confirm the new password.");
  if (next.length < 8 || next !== confirmation) return toast("New passwords must match and be at least 8 characters.");
  activeProfile.password = await passwordRecord(next);
  await putProfile(activeProfile);
  toast("Local password changed.");
}

function lockApp() {
  unlocked = false;
  closeModals();
  document.body.classList.remove("app-unlocked");
  showAuth("login");
}

function cleanData(input) {
  const source = input && typeof input === "object" ? input : {};
  const cleanTransactions = Array.isArray(source.transactions) ? source.transactions.map((t, index) => ({
    id: t.id ?? `legacy-${index}-${Date.now()}`, type: t.type === "income" ? "income" : "expense",
    amount: number(t.amount), date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : dateKey(today),
    category: String(t.category || "Other").slice(0, 80), payment: String(t.payment || "Cash").slice(0, 50),
    frequency: ["One-time", "Monthly", "Weekly"].includes(t.frequency) ? t.frequency : "One-time",
    notes: String(t.notes || "").slice(0, 240), generated: Boolean(t.generated), sourceId: t.sourceId || null, occurrence: t.occurrence || null
  })).filter(t => t.amount > 0) : [];
  return {
    ...seed, ...source, transactions: cleanTransactions,
    transfers: Array.isArray(source.transfers) ? source.transfers.map(t => ({ id: t.id ?? Date.now(), amount: number(t.amount), date: t.date || dateKey(today), destination: String(t.destination || "") })).filter(t => t.amount > 0) : [],
    goals: Array.isArray(source.goals) ? source.goals.map(g => ({ id: g.id ?? Date.now(), name: String(g.name || "Goal").slice(0, 80), target: number(g.target), saved: number(g.saved), deadline: g.deadline || dateKey(today) })).filter(g => g.target > 0) : [],
    pots: Array.isArray(source.pots) ? source.pots.map(p => ({ id: p.id ?? Date.now(), name: String(p.name || "Savings pot").slice(0, 80), target: number(p.target), saved: number(p.saved), color: ["teal", "coral", "purple", "yellow"].includes(p.color) ? p.color : "teal" })).filter(p => p.target > 0) : [],
    budgets: Array.isArray(source.budgets) ? source.budgets.map(b => ({ category: String(b.category || "Other"), amount: number(b.amount) })).filter(b => expenseCategories.includes(b.category) && b.amount > 0) : [],
    rule: { amount: Math.max(1, number(source.rule?.amount) || 20), type: source.rule?.type === "fixed" ? "fixed" : "percent" },
    settings: { ...seed.settings, ...(source.settings || {}), currency: source.settings?.currency || "MAD" }
  };
}

let data = cleanData(seed);
let currentType = "expense";
let currentFilter = "all";
let editingTransactionId = null;

const thisMonth = transaction => transaction.date.startsWith(monthKey);
const startOfWeek = value => { const date = new Date(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); date.setHours(0, 0, 0, 0); return date; };
const periodDates = period => period === "week" ? [startOfWeek(today), new Date(startOfWeek(today).getTime() + 6 * 86400000)] : [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0)];
const periodTransactions = period => { const [start, end] = periodDates(period); end.setHours(23, 59, 59, 999); return data.transactions.filter(t => { const date = dateAtNoon(t.date); return date >= start && date <= end; }); };
const allBalance = () => data.transactions.reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0) - data.transfers.reduce((sum, t) => sum + t.amount, 0);
const totals = transactions => ({ income: transactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0), expense: transactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0) });
const previousMonthTransactions = () => { const date = new Date(today.getFullYear(), today.getMonth() - 1, 1); const key = dateKey(date).slice(0, 7); return data.transactions.filter(t => t.date.startsWith(key)); };
const percentChange = (current, previous) => previous ? Math.round((current - previous) / previous * 100) : (current ? 100 : 0);

function recurringOccurrence(source, date) { return `${source.id}:${source.frequency}:${date}`; }
function expandRecurringTransactions() {
  const originals = data.transactions.filter(t => !t.generated && t.frequency !== "One-time");
  let changed = false;
  originals.forEach(source => {
    const sourceDate = dateAtNoon(source.date);
    const step = source.frequency === "Weekly" ? 7 : 1;
    let cursor = new Date(sourceDate);
    if (source.frequency === "Monthly") cursor = new Date(sourceDate);
    while (cursor <= today) {
      const occurrence = recurringOccurrence(source, dateKey(cursor));
      if (cursor > sourceDate && !data.transactions.some(t => t.occurrence === occurrence)) {
        data.transactions.push({ ...source, id: `${source.id}-${dateKey(cursor)}`, generated: true, sourceId: source.id, occurrence, date: dateKey(cursor) });
        changed = true;
      }
      if (source.frequency === "Monthly") cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + step);
    }
  });
  if (changed) save();
}

function ensureEmergencyPot() {
  let pot = data.pots.find(item => item.name.toLowerCase().includes("emergency"));
  if (!pot) {
    pot = { id: `emergency-${Date.now()}`, name: "Emergency fund", target: emergencyRecommendation(), saved: 0, color: "teal" };
    data.pots.unshift(pot);
  }
  return pot;
}
function applySavingsRule(income) {
  const ruleAmount = data.rule.type === "percent" ? income.amount * data.rule.amount / 100 : data.rule.amount;
  const amount = Math.min(Math.max(0, ruleAmount), Math.max(0, allBalance()));
  if (!amount) return;
  const pot = ensureEmergencyPot();
  pot.saved += amount;
  data.transfers.push({ id: `rule-${income.id}`, amount, date: income.date, destination: `pot:${pot.id}`, automatic: true });
}
function emergencyRecommendation() {
  const months = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const key = dateKey(date).slice(0, 7);
    months.push(totals(data.transactions.filter(t => t.type === "expense" && t.date.startsWith(key))).expense);
  }
  const nonZero = months.filter(value => value > 0);
  return Math.round((nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0) * 3);
}

function render() {
  const current = totals(data.transactions.filter(thisMonth));
  const previous = totals(previousMonthTransactions());
  const displayName = data.settings.name || "Your profile";
  const initials = displayName === "Your profile" ? "YP" : displayName.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  $("#profileDisplayName").textContent = displayName;
  $("#profileAvatar").textContent = initials;
  $(".avatar").textContent = initials;
  $("#totalBalance").textContent = money(allBalance());
  $("#incomeTotal").textContent = money(current.income);
  $("#expenseTotal").textContent = money(current.expense);
  const rate = current.income ? Math.round((current.income - current.expense) / current.income * 100) : 0;
  $("#savingsRate").textContent = `${rate}%`; $("#ringValue").textContent = `${rate}%`;
  $("#ruleLabel").textContent = data.rule.type === "percent" ? `${data.rule.amount}%` : money(data.rule.amount);
  $("#incomeMeta").innerHTML = `${percentChange(current.income, previous.income) >= 0 ? "↑" : "↓"} ${Math.abs(percentChange(current.income, previous.income))}% <span>vs last month</span>`;
  $("#expenseMeta").innerHTML = `${percentChange(current.expense, previous.expense) >= 0 ? "↑" : "↓"} ${Math.abs(percentChange(current.expense, previous.expense))}% <span>vs last month</span>`;
  $("#incomeBar").style.width = `${Math.min(100, current.income / 5000 * 100)}%`; $("#expenseBar").style.width = `${Math.min(100, current.expense / 2000 * 100)}%`;
  $(".progress-ring").style.background = `conic-gradient(var(--teal) ${Math.max(0, Math.min(100, rate))}%, #edf0ec ${Math.max(0, rate)}% 100%)`;
  renderChart(); renderCategories(); renderTransactions(); renderGoals(); renderPots(); renderReports(); renderFormOptions();
}

function renderChart() {
  const svg = $("#cashflowChart"); const period = $("#cashflowPeriod")?.value || "month"; const [start, end] = periodDates(period); const days = Math.round((end - start) / 86400000) + 1; const income = Array(days).fill(0); const expense = Array(days).fill(0);
  periodTransactions(period).forEach(t => { const index = Math.floor((dateAtNoon(t.date) - start) / 86400000); if (index >= 0 && index < days) (t.type === "income" ? income : expense)[index] += t.amount; });
  const max = Math.max(1, ...income, ...expense); const points = values => values.map((value, index) => `${index / Math.max(1, days - 1) * 680 + 10},${215 - value / max * 185}`).join(" ");
  svg.innerHTML = `<line x1="10" y1="215" x2="690" y2="215" stroke="#e9ede8"/><line x1="10" y1="155" x2="690" y2="155" stroke="#eef1ec"/><line x1="10" y1="95" x2="690" y2="95" stroke="#eef1ec"/><line x1="10" y1="35" x2="690" y2="35" stroke="#eef1ec"/><polyline points="${points(income)}" fill="none" stroke="#167d72" stroke-width="3" stroke-linecap="round"/><polyline points="${points(expense)}" fill="none" stroke="#ee785e" stroke-width="3" stroke-linecap="round"/>`;
  $$(".chart-labels span").forEach((label, index) => { const date = new Date(start.getTime() + Math.round(index * (days - 1) / 6) * 86400000); label.textContent = date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); });
}
function renderCategories() {
  const expenses = data.transactions.filter(t => t.type === "expense" && thisMonth(t)); const map = {}; expenses.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]); const total = sorted.reduce((sum, [, value]) => sum + value, 0);
  $("#donutTotal").textContent = money(total).replace(".00", ""); $("#categoryList").innerHTML = sorted.slice(0, 5).map(([category, value]) => `<div class="category-row"><i style="background:${categoryColors[category] || "#b7c4bd"}"></i><span class="category-icon">${iconMarkup(icons[category] || "overview")}</span><span>${h(category)}</span><strong>${money(value)}</strong></div>`).join("") || '<p class="muted">No spending yet.</p>';
  if (total) { let cursor = 0; $("#donutChart").style.background = `conic-gradient(${sorted.map(([category, value]) => { const start = cursor; cursor += value / total * 100; return `${categoryColors[category] || "#b7c4bd"} ${start}% ${cursor}%`; }).join(",")})`; }
}
function transactionMarkup(t, table = false) {
  const actions = `<span class="row-actions"><button class="text-btn edit-transaction" data-id="${h(t.id)}">Edit</button><button class="text-btn delete-transaction" data-id="${h(t.id)}">Delete</button></span>`;
  const note = h(t.notes || t.payment); const label = h(t.category); const amount = `${t.type === "income" ? "+" : "−"}${money(t.amount)}`;
  const categoryIcon = iconMarkup(icons[t.category] || "overview");
  return table ? `<div class="table-row"><div><strong class="table-category-icon">${categoryIcon}${label}</strong><small>${note}</small></div><span>${dateAtNoon(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><span class="badge">${h(t.frequency)}</span><strong class="transaction-amount ${t.type}">${amount}</strong>${actions}</div>` : `<div class="transaction-item"><div class="transaction-icon ${t.type}">${categoryIcon}</div><div class="transaction-info"><strong>${label}</strong><small>${note} · ${dateAtNoon(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><strong class="transaction-amount ${t.type}">${amount}</strong>${actions}</div>`;
}
function renderTransactions() {
  let list = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)); const search = ($("#transactionSearch")?.value || "").toLowerCase();
  list = list.filter(t => (currentFilter === "all" || t.type === currentFilter) && `${t.category} ${t.notes}`.toLowerCase().includes(search));
  $("#recentTransactions").innerHTML = list.slice(0, 5).map(t => transactionMarkup(t)).join("") || '<p class="muted">No transactions match.</p>';
  $("#transactionTable").innerHTML = list.map(t => transactionMarkup(t, true)).join("") || '<p class="muted">No transactions match.</p>'; $("#transactionCount").textContent = `${list.length} transaction${list.length === 1 ? "" : "s"}`;
}
function goalStatus(goal) {
  const remaining = Math.max(0, goal.target - goal.saved); const days = Math.max(0, Math.ceil((dateAtNoon(goal.deadline) - today) / 86400000)); const weekly = remaining / Math.max(1, Math.ceil(days / 7));
  return { remaining, days, weekly, status: remaining === 0 ? "Complete" : days === 0 ? "Past due" : weekly <= Math.max(1, goal.target / 52) ? "On track" : "Catch up" };
}
function renderGoals() {
  const goalHtml = goal => { const pct = Math.min(100, Math.round(goal.saved / goal.target * 100)); const status = goalStatus(goal); return `<div class="goal-card"><div class="goal-symbol">${iconMarkup("goals")}</div><h2>${h(goal.name)}</h2><div class="goal-date">Target · ${dateAtNoon(goal.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div><div class="goal-amounts"><strong>${money(goal.saved)}</strong><span>of ${money(goal.target)}</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="goal-foot"><span>${pct}% complete · ${status.status}</span><span class="${status.status === "Catch up" || status.status === "Past due" ? "behind" : ""}">${status.remaining ? `${money(status.weekly)}/week` : "Done"}</span></div><button class="text-btn transfer-btn" data-destination="goal:${h(goal.id)}">${iconMarkup("plus")} Add money</button> <button class="text-btn delete-goal" data-id="${h(goal.id)}">Delete</button></div>`; };
  $("#goalsGrid").innerHTML = data.goals.map(goalHtml).join("") || '<p class="muted">No goals yet. Add one to give your savings a direction.</p>';
  $("#goalsPreview").innerHTML = data.goals.slice(0, 2).map(goal => `<div class="goal-row"><div class="goal-row-head"><strong>${h(goal.name)}</strong><span>${Math.min(100, Math.round(goal.saved / goal.target * 100))}% · ${goalStatus(goal).status}</span></div><div class="progress"><span style="width:${Math.min(100, goal.saved / goal.target * 100)}%"></span></div></div>`).join("") || '<p class="muted">No goals yet.</p>';
}
function renderPots() {
  const saved = data.pots.reduce((sum, pot) => sum + pot.saved, 0); const target = data.pots.reduce((sum, pot) => sum + pot.target, 0); const emergency = data.pots.find(pot => pot.name.toLowerCase().includes("emergency")); const recommendation = emergencyRecommendation();
  $("#savedTotal").textContent = money(saved); $("#savingsRing span").textContent = `${target ? Math.min(100, Math.round(saved / target * 100)) : 0}%`;
  $("#emergencyProgress").textContent = emergency ? `${money(emergency.saved)} / ${money(emergency.target || recommendation)}` : `Recommended: ${money(recommendation)}`;
  $("#potsGrid").innerHTML = data.pots.map(pot => { const pct = Math.min(100, Math.round(pot.saved / pot.target * 100)); const color = pot.color === "coral" ? "var(--coral)" : pot.color === "purple" ? "var(--purple)" : pot.color === "yellow" ? "var(--yellow)" : "var(--teal)"; return `<div class="pot-card"><div class="pot-head"><span class="pot-icon ${h(pot.color)}">◎</span><span class="muted">${pct}%</span></div><h3>${h(pot.name)}</h3><div class="pot-amount">${money(pot.saved)} <span>of ${money(pot.target)}</span></div><div class="progress"><span style="width:${pct}%;background:${color}"></span></div><div class="pot-footer"><span>Progress</span><strong>${money(Math.max(0, pot.target - pot.saved))} to go</strong></div><button class="text-btn transfer-btn" data-destination="pot:${h(pot.id)}">＋ Add money</button> <button class="text-btn delete-pot" data-id="${h(pot.id)}">Delete</button></div>`; }).join("") || '<p class="muted">No savings pots yet. Create your first one above.</p>';
  const spent = {}; data.transactions.filter(t => t.type === "expense" && thisMonth(t)).forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });
  $("#budgetGrid").innerHTML = data.budgets.map(budget => { const used = spent[budget.category] || 0; const pct = Math.round(used / budget.amount * 100); return `<div class="budget-card"><div class="goal-row-head"><strong>${h(budget.category)}</strong><span>${money(used)} / ${money(budget.amount)}</span></div><div class="progress"><span style="width:${Math.min(100, pct)}%;background:${pct >= 100 ? "var(--coral)" : "var(--teal)"}"></span></div><small class="muted">${pct}% used${pct >= 80 ? " · " + (pct >= 100 ? "Over budget" : "Warning: near limit") : ""}</small> <button class="text-btn delete-budget" data-category="${h(budget.category)}">Delete</button></div>`; }).join("") || '<p class="muted">No budgets set yet.</p>';
  const food = spent.Food || 0; $("#savingAdvice").textContent = recommendation ? `A 3-month emergency fund would be about ${money(recommendation)}.` : "Your emergency recommendation will appear after you record expenses.";
  $("#savingAdviceBody").textContent = food ? `Food is ${money(food)} this month. Review your largest categories weekly and redirect the savings to your emergency fund.` : "Add expenses to get a recommendation based on your real spending.";
}

function renderReports() {
  const reportPeriod = $("#reportPeriod")?.value || "month"; const current = totals(periodTransactions(reportPeriod)); const previousDate = reportPeriod === "week" ? new Date(startOfWeek(today).getTime() - 7 * 86400000) : new Date(today.getFullYear(), today.getMonth() - 1, 1); const previousKey = dateKey(previousDate).slice(0, 7); const previous = reportPeriod === "week" ? totals(data.transactions.filter(t => { const d = dateAtNoon(t.date); return d >= previousDate && d < new Date(previousDate.getTime() + 7 * 86400000); })) : totals(data.transactions.filter(t => t.date.startsWith(previousKey)));
  const net = current.income - current.expense; const label = reportPeriod === "week" ? "This week" : today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  $("#reportStats").innerHTML = [["Income", money(current.income), "teal"], ["Expenses", money(current.expense), "coral"], ["Net savings", money(net), "teal"], ["Savings rate", `${current.income ? Math.round(net / current.income * 100) : 0}%`, "yellow"]].map(item => `<div class="report-stat"><small>${item[0]}</small><strong style="color:var(--${item[2]})">${item[1]}</strong><span class="muted">${label} · ${percentChange(item[1] === money(current.expense) ? current.expense : current.income, item[1] === money(current.expense) ? previous.expense : previous.income)}% vs prior</span></div>`).join("");
  const categories = {}; periodTransactions(reportPeriod).filter(t => t.type === "expense").forEach(t => { categories[t.category] = (categories[t.category] || 0) + t.amount; }); const rows = Object.entries(categories).sort((a, b) => b[1] - a[1]); const anomalies = data.transactions.filter(t => t.type === "expense" && t.date.startsWith(monthKey)).filter(t => { const peers = data.transactions.filter(x => x.type === "expense" && x.category === t.category && x.id !== t.id); const average = peers.length ? peers.reduce((sum, x) => sum + x.amount, 0) / peers.length : 0; return average > 0 && t.amount >= average * 2; });
  $("#trendList").innerHTML = rows.slice(0, 6).map(([category, value]) => { const budget = data.budgets.find(item => item.category === category); const usage = budget ? Math.round(value / budget.amount * 100) : null; return `<div class="trend-item"><div class="trend-head"><strong>${h(category)}</strong><span>${money(value)}</span></div><div class="trend-bar"><span style="width:${current.expense ? Math.min(100, value / current.expense * 100) : 0}%"></span></div><div class="trend-change">${usage !== null ? (usage >= 100 ? `Over budget by ${money(value - budget.amount)}` : `${usage}% of budget used`) : `${Math.round(value / (current.expense || 1) * 100)}% of spending`}</div></div>`; }).join("") || '<p class="muted">Add transactions to unlock personalized spending insights.</p>';
  const priorities = []; if (!current.income) priorities.push("Add regular income so savings targets can be measured."); else if (net <= 0) priorities.push(`Spending exceeds income by ${money(Math.abs(net))}. Review your highest category before adding new goals.`); else priorities.push(`You have ${money(net)} left after spending. Protect part of it with your automatic savings rule.`);
  const over = data.budgets.map(b => ({ b, spent: categories[b.category] || 0 })).filter(x => x.spent >= x.b.amount).sort((a, b) => b.spent - b.b.amount - (a.spent - a.b.amount))[0]; if (over) priorities.push(`${over.b.category} is ${money(over.spent - over.b.amount)} over budget. Pause or reduce this category.`);
  if (rows[0]) priorities.push(`${rows[0][0]} is your largest category at ${money(rows[0][1])}. A 10% reduction would free ${money(rows[0][1] * .1)}.`);
  if (anomalies.length) priorities.push(`High-spending alert: ${anomalies.length} expense${anomalies.length > 1 ? "s" : ""} is at least twice your usual ${h(anomalies[0].category)} amount.`);
  $("#reportAdvice").innerHTML = `<p><strong>${label}:</strong> ${money(current.income)} in, ${money(current.expense)} out, and <strong>${money(net)}</strong> net.</p><h3>Recommended next steps</h3><ol>${priorities.slice(0, 5).map(item => `<li>${item}</li>`).join("")}</ol><p class="muted">${percentChange(current.expense, previous.expense) > 0 ? `Spending is up ${percentChange(current.expense, previous.expense)}% versus the previous period.` : "Spending is stable or lower than the previous period."}</p>`;
}

function renderFormOptions() { const select = $("#category"); if (select) select.innerHTML = (currentType === "income" ? incomeCategories : expenseCategories).map(category => `<option>${h(category)}</option>`).join(""); }
function openModal(selector) { $(selector).classList.add("open"); }
function closeModals() { $$(".modal-backdrop").forEach(modal => modal.classList.remove("open")); }
function startTransaction() { editingTransactionId = null; $("#transactionForm button[type=submit]").textContent = "Add transaction"; $("#date").value = dateKey(today); openModal("#transactionModal"); }

$$(".nav-item").forEach(button => button.addEventListener("click", () => { $$(".nav-item").forEach(item => item.classList.remove("active")); button.classList.add("active"); $$(".view").forEach(view => view.classList.remove("active")); $(`#${button.dataset.view}View`).classList.add("active"); }));
$$("[data-view-target]").forEach(button => button.addEventListener("click", () => $(`[data-view="${button.dataset.viewTarget}"]`).click()));
$("#addTransactionBtn").onclick = startTransaction; $("#addTransactionBtn2").onclick = startTransaction; $("#addGoalBtn").onclick = () => openModal("#goalModal"); $("#addPotBtn").onclick = () => openModal("#potModal"); $("#editRuleBtn").onclick = () => { $("#ruleAmount").value = data.rule.amount; $("#ruleType").value = data.rule.type; openModal("#ruleModal"); };
const openProfile = () => { $("#profileName").value = data.settings.name; $("#profileDisplayName").textContent = data.settings.name || "Your profile"; $("#currencySelect").value = data.settings.currency; openModal("#settingsModal"); };
$("#settingsBtn").onclick = openProfile; $(".avatar").onclick = openProfile; $$("[data-close]").forEach(button => button.onclick = closeModals); $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModals(); }));
$("#addBudgetBtn").onclick = () => { $("#budgetCategory").innerHTML = expenseCategories.map(category => `<option>${h(category)}</option>`).join(""); openModal("#budgetModal"); }; $("#cashflowPeriod").onchange = renderChart; $("#reportPeriod").onchange = renderReports;
document.addEventListener("click", event => {
  const transfer = event.target.closest(".transfer-btn"); if (transfer) { $("#transferDestination").innerHTML = [...data.goals.map(g => `<option value="goal:${h(g.id)}">Goal: ${h(g.name)}</option>`), ...data.pots.map(p => `<option value="pot:${h(p.id)}">Savings pot: ${h(p.name)}</option>`)].join(""); $("#transferDestination").value = transfer.dataset.destination; $("#transferAmount").value = ""; openModal("#transferModal"); }
  const edit = event.target.closest(".edit-transaction"); if (edit) { const transaction = data.transactions.find(item => String(item.id) === edit.dataset.id); if (!transaction) return; editingTransactionId = transaction.id; currentType = transaction.type; $$(".type-toggle button").forEach(item => item.classList.toggle("active", item.dataset.type === currentType)); renderFormOptions(); ["amount", "date", "category", "payment", "frequency", "notes"].forEach(id => { $(`#${id}`).value = transaction[id] || ""; }); $("#transactionForm button[type=submit]").textContent = "Save changes"; openModal("#transactionModal"); }
  const remove = event.target.closest(".delete-transaction"); if (remove && confirm("Delete this transaction?")) { data.transactions = data.transactions.filter(item => String(item.id) !== remove.dataset.id); save(); render(); toast("Transaction deleted."); }
  const goal = event.target.closest(".delete-goal"); if (goal && confirm("Delete this goal?")) { data.goals = data.goals.filter(item => String(item.id) !== goal.dataset.id); save(); render(); toast("Goal deleted."); }
  const pot = event.target.closest(".delete-pot"); if (pot && confirm("Delete this savings pot?")) { data.pots = data.pots.filter(item => String(item.id) !== pot.dataset.id); save(); render(); toast("Savings pot deleted."); }
  const budget = event.target.closest(".delete-budget"); if (budget && confirm("Delete this budget?")) { data.budgets = data.budgets.filter(item => item.category !== budget.dataset.category); save(); render(); toast("Budget deleted."); }
});
$$(".type-toggle button").forEach(button => button.onclick = () => { $$(".type-toggle button").forEach(item => item.classList.remove("active")); button.classList.add("active"); currentType = button.dataset.type; renderFormOptions(); });
$("#transactionForm").onsubmit = event => { event.preventDefault(); const amount = number($("#amount").value); const date = $("#date").value; if (!(amount > 0) || !date || dateAtNoon(date).toString() === "Invalid Date") { toast("Enter a valid amount and date."); return; } const record = { id: editingTransactionId || `tx-${Date.now()}`, type: currentType, amount, date, category: $("#category").value, payment: $("#payment").value, frequency: $("#frequency").value, notes: $("#notes").value.trim().slice(0, 240), generated: false, sourceId: null, occurrence: null };
  if (editingTransactionId) { const index = data.transactions.findIndex(item => item.id === editingTransactionId); if (index >= 0) data.transactions[index] = { ...data.transactions[index], ...record }; toast("Transaction updated."); } else { data.transactions.push(record); if (record.type === "income") applySavingsRule(record); toast("Transaction added — savings rule applied."); } save(); render(); closeModals(); event.target.reset(); editingTransactionId = null; };
$("#goalForm").onsubmit = event => { event.preventDefault(); const target = number($("#goalTarget").value); if (!(target > 0) || !$("#goalDeadline").value) return toast("Enter a valid target and deadline."); data.goals.push({ id: `goal-${Date.now()}`, name: $("#goalName").value.trim().slice(0, 80), target, saved: 0, deadline: $("#goalDeadline").value }); save(); render(); closeModals(); event.target.reset(); toast("Goal created. You’ve got this!"); };
$("#potForm").onsubmit = event => { event.preventDefault(); const target = number($("#potTarget").value); if (!(target > 0) || !$("#potName").value.trim()) return toast("Enter a valid pot name and target."); data.pots.push({ id: `pot-${Date.now()}`, name: $("#potName").value.trim().slice(0, 80), target, saved: 0, color: $("#potColor").value }); save(); render(); closeModals(); event.target.reset(); toast("Savings pot created."); };
$("#budgetForm").onsubmit = event => { event.preventDefault(); const category = $("#budgetCategory").value; const amount = number($("#budgetAmount").value); if (!(amount > 0)) return toast("Enter a valid budget."); const existing = data.budgets.find(item => item.category === category); if (existing) existing.amount = amount; else data.budgets.push({ category, amount }); save(); render(); closeModals(); event.target.reset(); toast("Budget saved."); };
$("#transferForm").onsubmit = event => { event.preventDefault(); const amount = number($("#transferAmount").value); const destination = $("#transferDestination").value; if (!(amount > 0) || amount > allBalance()) return toast("Transfer amount exceeds your available balance."); const [type, id] = destination.split(":"); const collection = type === "goal" ? data.goals : data.pots; const item = collection.find(value => String(value.id) === id); if (!item) return toast("Choose a savings destination."); item.saved += amount; data.transfers.push({ id: `transfer-${Date.now()}`, amount, date: dateKey(today), destination }); save(); render(); closeModals(); event.target.reset(); toast("Money transferred to savings."); };
$("#ruleForm").onsubmit = event => { event.preventDefault(); const amount = number($("#ruleAmount").value); if (!(amount > 0) || ($("#ruleType").value === "percent" && amount > 100)) return toast("Enter a valid savings rule."); data.rule = { amount, type: $("#ruleType").value }; save(); render(); closeModals(); toast("Savings rule updated."); };
$("#saveSettingsBtn").onclick = () => { data.settings = { ...data.settings, name: $("#profileName").value.trim().slice(0, 80), currency: $("#currencySelect").value }; save(); render(); closeModals(); toast("Settings saved."); };
$("#changePasswordBtn").onclick = changePassword;
$("#logoutBtn").onclick = lockApp;
$("#exportBackupBtn").onclick = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "pennywise-backup.json"; link.click(); URL.revokeObjectURL(link.href); toast("Backup exported."); };
$("#importBackupInput").onchange = event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { data = cleanData(JSON.parse(reader.result)); save(); render(); closeModals(); toast("Backup imported."); } catch (error) { console.warn("Backup import rejected.", error); toast("Could not import this backup."); } }; reader.readAsText(file); };
$("#resetDataBtn").onclick = () => { if (confirm("Reset all your data?")) { data = cleanData(seed); save(); render(); closeModals(); toast("Data reset."); } };
$$(".segmented button").forEach(button => button.onclick = () => { $$(".segmented button").forEach(item => item.classList.remove("active")); button.classList.add("active"); currentFilter = button.dataset.filter; renderTransactions(); }); $("#transactionSearch").oninput = renderTransactions;
$("#exportBtn").onclick = () => { const rows = [["Type", "Date", "Category", "Amount", "Payment method", "Frequency", "Notes"], ...data.transactions.map(t => [t.type, t.date, t.category, t.amount, t.payment, t.frequency, t.notes])]; const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "pennywise-transactions.csv"; link.click(); URL.revokeObjectURL(link.href); toast("CSV export downloaded."); };
$("#downloadPdfBtn").onclick = () => { const current = totals(periodTransactions($("#reportPeriod").value)); const rows = Object.entries(data.transactions.filter(t => t.type === "expense" && t.date.startsWith(monthKey)).reduce((map, t) => { map[t.category] = (map[t.category] || 0) + t.amount; return map; }, {})).sort((a, b) => b[1] - a[1]); const bars = rows.slice(0, 6).map(([category, value]) => `<div class="report-bar"><span>${h(category)}</span><i style="width:${current.expense ? Math.round(value / current.expense * 100) : 0}%"></i><b>${money(value)}</b></div>`).join(""); const report = `<html><head><title>Pennywise report</title><style>body{background:#10171a;color:#e8f0ec;font:14px system-ui;padding:36px;max-width:850px;margin:auto}h1{color:#70d1bd}section{background:#182326;border:1px solid #2d3b3a;border-radius:12px;padding:20px;margin:16px 0}.stats{display:flex;gap:28px}.stat{color:#93aaa2}.stat b{display:block;color:#70d1bd;font-size:22px}.report-bar{display:grid;grid-template-columns:130px 1fr 110px;gap:12px;align-items:center;margin:12px 0}.report-bar i{height:8px;border-radius:8px;background:#ee785e;display:block}</style></head><body><h1>Pennywise · ${dateKey(today)}</h1><section><div class="stats"><div class="stat">Income<b>${money(current.income)}</b></div><div class="stat">Expenses<b>${money(current.expense)}</b></div><div class="stat">Net<b>${money(current.income - current.expense)}</b></div></div></section><section><h2>Spending breakdown</h2>${bars || "<p>No expenses recorded.</p>"}</section><p>Generated locally from your Pennywise data. Print or save this page as PDF.</p></body></html>`; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([report], { type: "text/html" })); link.download = `pennywise-report-${dateKey(today)}.html`; link.click(); URL.revokeObjectURL(link.href); toast("Dark report downloaded."); };

$("#todayLabel").textContent = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase(); $("#date").value = dateKey(today);
initAuth();
