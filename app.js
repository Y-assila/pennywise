const incomeCategories = ["Salary", "Freelance", "Gifts", "Refunds", "Bonuses", "Investments", "Other"];
const expenseCategories = ["Rent", "Food", "Transport", "Bills", "Entertainment", "Health", "Debt payments", "Subscriptions", "Shopping", "Other"];
const categoryColors = { Rent: "#167d72", Food: "#ee785e", Transport: "#f3ba4d", Bills: "#8a78c7", Entertainment: "#7fb9ad", Health: "#d98b70", "Debt payments": "#ad9bda", Subscriptions: "#77a08e", Shopping: "#f0a35a", Other: "#b7c4bd" };
const icons = { Rent: "home", Food: "food", Transport: "transport", Bills: "bills", Entertainment: "sparkles", Health: "health", "Debt payments": "arrowDown", Subscriptions: "savings", Shopping: "shopping", Other: "overview", Salary: "arrowUpRight", Freelance: "pencil", Gifts: "gift", Refunds: "arrowDown", Bonuses: "sparkles", Investments: "arrowUpRight" };
const iconMarkup = name => typeof pennywiseIcon === "function" ? pennywiseIcon(name) : "";
const seed = { transactions: [], transfers: [], goals: [], pots: [], budgets: [], rule: { amount: 20, type: "percent" }, settings: { name: "", currency: "MAD", language: "en", lastBackup: null } };
const storageVersion = 3;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const today = new Date();
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
let monthKey = dateKey(viewDate).slice(0, 7);
const isCurrentMonth = () => viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() === today.getMonth();
const anchorDate = () => isCurrentMonth() ? new Date(today) : new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 12);
function setViewMonth(offset) {
  const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
  if (next > new Date(today.getFullYear(), today.getMonth(), 1)) return;
  viewDate = next; monthKey = dateKey(viewDate).slice(0, 7); render();
}
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
let toastTimer;
const toast = (message, type) => { const node = $("#toast"); if (!node) return; const isError = type ? type === "error" : /could not|can't|cannot|exceed|enter a|enter your|incorrect|must|invalid|unavailable|not found|not available|failed|rejected|popup/i.test(message); node.textContent = message; node.className = `toast show${isError ? " error" : ""}`; node.setAttribute("role", isError ? "alert" : "status"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), isError ? 4200 : 2800); };
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
  const typedName = $("#authName").value;
  $("#authForm").reset();
  if (message) { $("#authName").value = typedName; $("#authPassword").focus(); } else $("#authName").focus();
}

async function unlockApp() {
  try { navigator.storage?.persist?.(); } catch (error) { /* best effort */ }
  data = cleanData(activeProfile?.data || seed);
  data.settings.name = activeProfile?.name || data.settings.name;
  unlocked = true;
  document.body.classList.add("app-unlocked");
  expandRecurringTransactions();
  render();
}

async function initAuth() {
  if (!window.crypto?.subtle) {
    showAuth("setup", "Secure password storage is unavailable here. Open the app from its HTTPS GitHub Pages URL or localhost, not an unsupported browser context.");
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
  unlocked = false; activeProfile = null; data = cleanData(seed); render();
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
    transfers: Array.isArray(source.transfers) ? source.transfers.map((t, i) => ({ id: t.id ?? `transfer-legacy-${i}`, amount: number(t.amount), date: t.date || dateKey(today), destination: String(t.destination || ""), automatic: Boolean(t.automatic) })).filter(t => t.amount !== 0) : [],
    goals: Array.isArray(source.goals) ? source.goals.map((g, i) => ({ id: g.id ?? `goal-legacy-${i}`, name: String(g.name || "Goal").slice(0, 80), target: Math.max(1, number(g.target)), saved: Math.max(0, number(g.saved)), deadline: g.deadline || dateKey(today), created: g.created || dateKey(today) })) : [],
    pots: Array.isArray(source.pots) ? source.pots.map((p, i) => ({ id: p.id ?? `pot-legacy-${i}`, name: String(p.name || "Savings pot").slice(0, 80), target: Math.max(1, number(p.target)), saved: Math.max(0, number(p.saved)), color: ["teal", "coral", "purple", "yellow"].includes(p.color) ? p.color : "teal" })) : [],
    budgets: Array.isArray(source.budgets) ? source.budgets.map(b => ({ category: String(b.category || "Other"), amount: number(b.amount) })).filter(b => expenseCategories.includes(b.category) && b.amount > 0) : [],
    rule: { amount: Math.max(1, number(source.rule?.amount) || 20), type: ["fixed", "off"].includes(source.rule?.type) ? source.rule.type : "percent" },
    settings: { ...seed.settings, ...(source.settings || {}), currency: ["MAD", "EUR", "USD", "GBP"].includes(source.settings?.currency) ? source.settings.currency : "MAD", lastBackup: source.settings?.lastBackup || null }
  };
}

let data = cleanData(seed);
let currentType = "expense";
let currentFilter = "all";
let editingTransactionId = null;
let transactionLimit = 25;

const thisMonth = transaction => transaction.date.startsWith(monthKey);
const startOfWeek = value => { const date = new Date(value); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); date.setHours(0, 0, 0, 0); return date; };
const periodDates = period => period === "week" ? [startOfWeek(anchorDate()), new Date(startOfWeek(anchorDate()).getTime() + 6 * 86400000)] : [new Date(viewDate.getFullYear(), viewDate.getMonth(), 1), new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)];
const periodTransactions = period => { const [start, end] = periodDates(period); end.setHours(23, 59, 59, 999); return data.transactions.filter(t => { const date = dateAtNoon(t.date); return date >= start && date <= end; }); };
const allBalance = () => data.transactions.reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0) - data.transfers.reduce((sum, t) => sum + t.amount, 0);
const totals = transactions => ({ income: transactions.filter(t => t.type === "income").reduce((sum, t) => sum + t.amount, 0), expense: transactions.filter(t => t.type === "expense").reduce((sum, t) => sum + t.amount, 0) });
const previousMonthTransactions = () => { const date = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); const key = dateKey(date).slice(0, 7); return data.transactions.filter(t => t.date.startsWith(key)); };
const percentChange = (current, previous) => previous ? Math.round((current - previous) / previous * 100) : (current ? 100 : 0);

function recurringOccurrence(source, date) { return `${source.id}:${source.frequency}:${date}`; }
function expandRecurringTransactions() {
  const originals = data.transactions.filter(t => !t.generated && t.frequency !== "One-time");
  let changed = false;
  originals.forEach(source => {
    const sourceDate = dateAtNoon(source.date);
    const step = source.frequency === "Weekly" ? 7 : 1;
    for (let n = 1; ; n += 1) {
      let cursor;
      if (source.frequency === "Monthly") {
        const target = new Date(sourceDate.getFullYear(), sourceDate.getMonth() + n, 1, 12);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(sourceDate.getDate(), lastDay));
        cursor = target;
      } else {
        cursor = new Date(sourceDate); cursor.setDate(cursor.getDate() + step * n);
      }
      if (cursor > today) break;
      const occurrence = recurringOccurrence(source, dateKey(cursor));
      if (!data.transactions.some(t => t.occurrence === occurrence)) {
        const created = { ...source, id: `${source.id}-${dateKey(cursor)}`, generated: true, sourceId: source.id, occurrence, date: dateKey(cursor) };
        data.transactions.push(created);
        if (created.type === "income") applySavingsRule(created);
        changed = true;
      }
    }
  });
  if (changed) save();
}

function ensureEmergencyPot() {
  let pot = data.pots.find(item => item.name.toLowerCase().includes("emergency"));
  if (!pot) {
    pot = { id: `emergency-${Date.now()}`, name: "Emergency fund", target: Math.max(1, emergencyRecommendation() || 1000), saved: 0, color: "teal" };
    data.pots.unshift(pot);
  }
  return pot;
}
function removeAutoTransfer(incomeId) {
  const index = data.transfers.findIndex(t => t.id === `rule-${incomeId}`);
  if (index < 0) return;
  const [transfer] = data.transfers.splice(index, 1);
  const pot = data.pots.find(p => `pot:${p.id}` === transfer.destination);
  if (pot) pot.saved = Math.max(0, pot.saved - transfer.amount);
}
function applySavingsRule(income) {
  if (data.rule.type === "off" || data.transfers.some(t => t.id === `rule-${income.id}`)) return;
  const ruleAmount = data.rule.type === "percent" ? income.amount * data.rule.amount / 100 : data.rule.amount;
  const amount = Math.min(Math.max(0, ruleAmount), Math.max(0, allBalance()));
  if (!amount) return;
  const pot = ensureEmergencyPot();
  pot.saved += amount; pot.target = Math.max(pot.target, pot.saved, emergencyRecommendation());
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
  $("#ruleMeta").innerHTML = data.rule.type === "off" ? "Auto-saving is <strong>off</strong>" : `Your rule: <strong>${data.rule.type === "percent" ? data.rule.amount + "%" : h(money(data.rule.amount))}</strong> ${data.rule.type === "percent" ? "of income" : "per income"}`;
  $("#incomeMeta").innerHTML = previous.income ? `${percentChange(current.income, previous.income) >= 0 ? "↑" : "↓"} ${Math.abs(percentChange(current.income, previous.income))}% <span>vs last month</span>` : "<span>No data last month</span>";
  $("#expenseMeta").innerHTML = previous.expense ? `${percentChange(current.expense, previous.expense) >= 0 ? "↑" : "↓"} ${Math.abs(percentChange(current.expense, previous.expense))}% <span>vs last month</span>` : "<span>No data last month</span>";
  const barMax = Math.max(1, current.income, current.expense); $("#incomeBar").style.width = `${current.income / barMax * 100}%`; $("#expenseBar").style.width = `${current.expense / barMax * 100}%`;
  renderBalanceTrend(); const hour = new Date().getHours(); const greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; $("#greeting").textContent = data.settings.name ? `${greeting}, ${data.settings.name.split(/\s+/)[0]}` : greeting; renderBackupNotice(); renderMonthNav(); renderBudgetAlerts();
  $(".progress-ring").style.background = `conic-gradient(var(--teal) ${Math.max(0, Math.min(100, rate))}%, #22343a 0)`;
  renderChart(); renderCategories(); renderTransactions(); renderGoals(); renderPots(); renderReports(); renderFormOptions();
}

function renderBalanceTrend() {
  const days = 30; const points = []; const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0, 23, 59, 59); const endDay = isCurrentMonth() ? new Date(today) : new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const balanceAt = end => data.transactions.filter(t => dateAtNoon(t.date) <= end).reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0) - data.transfers.filter(t => dateAtNoon(t.date) <= end).reduce((sum, t) => sum + t.amount, 0);
  for (let i = days - 1; i >= 0; i -= 1) { const d = new Date(endDay); d.setDate(d.getDate() - i); d.setHours(23, 59, 59); points.push(balanceAt(d)); }
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  $("#balanceSparkline").setAttribute("d", points.map((v, i) => `${i ? "L" : "M"}${(i / (days - 1) * 240).toFixed(1)} ${(48 - (v - min) / span * 40).toFixed(1)}`).join(" "));
  const now = points[points.length - 1]; const last = balanceAt(monthEnd); const change = percentChange(now, last); const up = now >= last;
  const meta = $("#balanceMeta"); meta.className = `stat-meta ${up ? "positive" : "negative"}`; meta.innerHTML = last ? `${up ? "↑" : "↓"} ${Math.abs(change)}% <span>vs last month</span>` : "<span>No data last month</span>";
}
function renderMonthNav() {
  $("#monthLabel").textContent = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  $("#monthNext").disabled = isCurrentMonth();
  $("#snapshotText").textContent = isCurrentMonth() ? "Here’s your financial snapshot for this month." : "You’re looking at a past month. Balance cards show that month’s activity.";
}
function renderBudgetAlerts() {
  const spent = {}; data.transactions.filter(t => t.type === "expense" && thisMonth(t)).forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });
  const alerts = data.budgets.map(b => ({ b, used: spent[b.category] || 0 })).filter(x => x.used >= x.b.amount * 0.8).sort((a, b) => b.used / b.b.amount - a.used / a.b.amount);
  $("#budgetAlerts").innerHTML = alerts.map(({ b, used }) => { const over = used >= b.amount; return `<div class="budget-alert ${over ? "over" : ""}"><strong>${h(b.category)}</strong> ${over ? `is ${h(money(used - b.amount))} over budget` : `has used ${Math.round(used / b.amount * 100)}% of its budget`} <span>${h(money(used))} / ${h(money(b.amount))}</span></div>`; }).join("");
}
function renderBackupNotice() {
  const node = $(".storage-warning"); const last = data.settings.lastBackup; const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
  node.textContent = !last ? "Your data lives only in this browser. Export a full backup (Settings) so you can't lose it." : days > 30 ? `Last backup was ${days} days ago. Export a fresh backup from Settings.` : `Last backup: ${days === 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " ago"}.`;
  node.classList.toggle("stale", !last || days > 30);
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
  if (!total) $("#donutChart").style.background = "#22302f"; if (total) { let cursor = 0; $("#donutChart").style.background = `conic-gradient(${sorted.map(([category, value]) => { const start = cursor; cursor += value / total * 100; return `${categoryColors[category] || "#b7c4bd"} ${start}% ${cursor}%`; }).join(",")})`; }
}
function transactionMarkup(t, table = false) {
  const actions = `<span class="row-actions"><button class="text-btn edit-transaction" data-id="${h(t.id)}">Edit</button><button class="text-btn delete-transaction" data-id="${h(t.id)}">Delete</button></span>`;
  const note = h(t.notes || t.payment); const label = h(t.category); const amount = `${t.type === "income" ? "+" : "−"}${money(t.amount)}`;
  const categoryIcon = iconMarkup(icons[t.category] || "overview");
  return table ? `<div class="table-row"><div><strong class="table-category-icon">${categoryIcon}${label}</strong><small>${note}</small></div><span>${dateAtNoon(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><span class="badge">${h(t.frequency)}</span><strong class="transaction-amount ${t.type}">${amount}</strong>${actions}</div>` : `<div class="transaction-item"><div class="transaction-icon ${t.type}">${categoryIcon}</div><div class="transaction-info"><strong>${label}</strong><small>${note} · ${dateAtNoon(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small></div><strong class="transaction-amount ${t.type}">${amount}</strong>${actions}</div>`;
}
function renderTransactions() {
  const sort = $("#transactionSort")?.value || "newest"; const sorters = { newest: (a, b) => b.date.localeCompare(a.date), oldest: (a, b) => a.date.localeCompare(b.date), largest: (a, b) => b.amount - a.amount, smallest: (a, b) => a.amount - b.amount };
  let list = [...data.transactions].sort(sorters[sort] || sorters.newest); const search = ($("#transactionSearch")?.value || "").toLowerCase();
  list = list.filter(t => (currentFilter === "all" || t.type === currentFilter) && `${t.category} ${t.notes}`.toLowerCase().includes(search));
  $("#recentTransactions").innerHTML = list.slice(0, 5).map(t => transactionMarkup(t)).join("") || '<p class="muted">No transactions match.</p>';
  $("#transactionTable").innerHTML = list.slice(0, transactionLimit).map(t => transactionMarkup(t, true)).join("") || '<p class="muted">No transactions match.</p>'; $("#showMoreTransactions").hidden = list.length <= transactionLimit; $("#showMoreTransactions").textContent = `Show more (${list.length - transactionLimit} remaining)`; $("#transactionCount").textContent = `${list.length} transaction${list.length === 1 ? "" : "s"}`;
}
function goalStatus(goal) {
  const remaining = Math.max(0, goal.target - goal.saved); const days = Math.max(0, Math.ceil((dateAtNoon(goal.deadline) - today) / 86400000)); const weekly = remaining / Math.max(1, Math.ceil(days / 7));
  const total = Math.max(1, (dateAtNoon(goal.deadline) - dateAtNoon(goal.created || dateKey(today))) / 86400000); const elapsed = Math.min(1, Math.max(0, (today - dateAtNoon(goal.created || dateKey(today))) / 86400000 / total));
  return { remaining, days, weekly, status: remaining === 0 ? "Complete" : days === 0 ? "Past due" : goal.saved / goal.target >= elapsed * 0.9 ? "On track" : "Catch up" };
}
function renderGoals() {
  const goalHtml = goal => { const pct = Math.min(100, Math.round(goal.saved / goal.target * 100)); const status = goalStatus(goal); return `<div class="goal-card"><div class="goal-symbol">${iconMarkup("goals")}</div><h2>${h(goal.name)}</h2><div class="goal-date">Target · ${dateAtNoon(goal.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div><div class="goal-amounts"><strong>${money(goal.saved)}</strong><span>of ${money(goal.target)}</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="goal-foot"><span>${pct}% complete · ${status.status}</span><span class="${status.status === "Catch up" || status.status === "Past due" ? "behind" : ""}">${status.remaining ? `${money(status.weekly)}/week` : "Done"}</span></div><div class="card-actions"><button class="text-btn transfer-btn" data-destination="goal:${h(goal.id)}">${iconMarkup("plus")} Move money</button><button class="text-btn delete-goal" data-id="${h(goal.id)}">Delete</button></div></div>`; };
  $("#goalsGrid").innerHTML = data.goals.map(goalHtml).join("") || '<p class="muted">No goals yet. Add one to give your savings a direction.</p>';
  $("#goalsPreview").innerHTML = data.goals.slice(0, 2).map(goal => `<div class="goal-row"><div class="goal-row-head"><strong>${h(goal.name)}</strong><span>${Math.min(100, Math.round(goal.saved / goal.target * 100))}% · ${goalStatus(goal).status}</span></div><div class="progress"><span style="width:${Math.min(100, goal.saved / goal.target * 100)}%"></span></div></div>`).join("") || '<p class="muted">No goals yet.</p>';
}
function renderPots() {
  const saved = data.pots.reduce((sum, pot) => sum + pot.saved, 0); const target = data.pots.reduce((sum, pot) => sum + pot.target, 0); const emergency = data.pots.find(pot => pot.name.toLowerCase().includes("emergency")); const recommendation = emergencyRecommendation();
  $("#savedTotal").textContent = money(saved); $("#savingsRing span").textContent = `${target ? Math.min(100, Math.round(saved / target * 100)) : 0}%`;
  $("#emergencyProgress").textContent = emergency ? `${money(emergency.saved)} / ${money(emergency.target || recommendation)}` : `Recommended: ${money(recommendation)}`;
  $("#potsGrid").innerHTML = data.pots.map(pot => { const pct = Math.min(100, Math.round(pot.saved / pot.target * 100)); const color = pot.color === "coral" ? "var(--coral)" : pot.color === "purple" ? "var(--purple)" : pot.color === "yellow" ? "var(--yellow)" : "var(--teal)"; return `<div class="pot-card"><div class="pot-head"><span class="pot-icon ${h(pot.color)}">◎</span><span class="muted">${pct}%</span></div><h3>${h(pot.name)}</h3><div class="pot-amount">${money(pot.saved)} <span>of ${money(pot.target)}</span></div><div class="progress"><span style="width:${pct}%;background:${color}"></span></div><div class="pot-footer"><span>Progress</span><strong>${money(Math.max(0, pot.target - pot.saved))} to go</strong></div><div class="pot-actions"><button class="text-btn transfer-btn" data-destination="pot:${h(pot.id)}">＋ Move money</button><button class="text-btn delete-pot" data-id="${h(pot.id)}">Delete</button></div></div>`; }).join("") || '<p class="muted">No savings pots yet. Create your first one above.</p>';
  const spent = {}; data.transactions.filter(t => t.type === "expense" && thisMonth(t)).forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });
  $("#budgetGrid").innerHTML = data.budgets.map(budget => { const used = spent[budget.category] || 0; const pct = Math.round(used / budget.amount * 100); return `<div class="budget-card"><div class="goal-row-head"><strong>${h(budget.category)}</strong><span>${money(used)} / ${money(budget.amount)}</span></div><div class="progress"><span style="width:${Math.min(100, pct)}%;background:${pct >= 100 ? "var(--coral)" : "var(--teal)"}"></span></div><small class="muted">${pct}% used${pct >= 80 ? " · " + (pct >= 100 ? "Over budget" : "Warning: near limit") : ""}</small> <button class="text-btn delete-budget" data-category="${h(budget.category)}">Delete</button></div>`; }).join("") || '<p class="muted">No budgets set yet.</p>';
  const food = spent.Food || 0; $("#savingAdvice").textContent = recommendation ? `A 3-month emergency fund would be about ${money(recommendation)}.` : "Your emergency recommendation will appear after you record expenses.";
  $("#savingAdviceBody").textContent = food ? `Food is ${money(food)} this month. Review your largest categories weekly and redirect the savings to your emergency fund.` : "Add expenses to get a recommendation based on your real spending.";
}

function renderFormOptions() { const select = $("#category"); if (select) select.innerHTML = (currentType === "income" ? incomeCategories : expenseCategories).map(category => `<option>${h(category)}</option>`).join(""); }
function openModal(selector) { $(selector).classList.add("open"); }
function closeModals() { $$(".modal-backdrop").forEach(modal => modal.classList.remove("open")); }
function setTransactionType(type) { currentType = type; $$(".type-toggle button").forEach(item => item.classList.toggle("active", item.dataset.type === type)); renderFormOptions(); }
function startTransaction() { editingTransactionId = null; $("#transactionForm").reset(); setTransactionType("expense"); $("#transactionForm button[type=submit]").textContent = "Add transaction"; $("#date").value = dateKey(today); openModal("#transactionModal"); $("#amount").focus(); }

$$(".nav-item").forEach(button => button.addEventListener("click", () => { $$(".nav-item").forEach(item => item.classList.remove("active")); button.classList.add("active"); $$(".view").forEach(view => view.classList.remove("active")); $(`#${button.dataset.view}View`).classList.add("active"); $(".sidebar")?.classList.remove("mobile-menu-open"); $("#mobileMenuBtn")?.setAttribute("aria-expanded", "false"); }));
$$("[data-view-target]").forEach(button => button.addEventListener("click", () => $(`[data-view="${button.dataset.viewTarget}"]`).click()));
$("#addTransactionBtn").onclick = startTransaction; $("#addTransactionBtn2").onclick = startTransaction; $("#addGoalBtn").onclick = () => openModal("#goalModal"); $("#addPotBtn").onclick = () => openModal("#potModal"); $("#editRuleBtn").onclick = () => { $("#ruleAmount").value = data.rule.amount; $("#ruleType").value = data.rule.type; openModal("#ruleModal"); };
const openProfile = () => { $("#profileName").value = data.settings.name; $("#profileDisplayName").textContent = data.settings.name || "Your profile"; $("#currencySelect").value = data.settings.currency; const last = data.settings.lastBackup; $("#backupStatus").textContent = last ? `Last backup: ${new Date(last).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : "No backup yet. Export one so you can restore your data later."; openModal("#settingsModal"); };
$("#settingsBtn").onclick = openProfile; $(".avatar").onclick = openProfile; $$("[data-close]").forEach(button => button.onclick = closeModals); $$(".modal-backdrop").forEach(modal => modal.addEventListener("click", event => { if (event.target === modal) closeModals(); }));
$("#mobileMenuBtn").onclick = () => { const sidebar = $(".sidebar"); const button = $("#mobileMenuBtn"); const open = sidebar.classList.toggle("mobile-menu-open"); button.setAttribute("aria-expanded", String(open)); };
$("#addBudgetBtn").onclick = () => { $("#budgetCategory").innerHTML = expenseCategories.map(category => `<option>${h(category)}</option>`).join(""); openModal("#budgetModal"); }; $("#cashflowPeriod").onchange = renderChart; $("#monthPrev").onclick = () => setViewMonth(-1); $("#monthNext").onclick = () => setViewMonth(1);
document.addEventListener("click", event => {
  const transfer = event.target.closest(".transfer-btn"); if (transfer) { $("#transferDestination").innerHTML = [...data.goals.map(g => `<option value="goal:${h(g.id)}">Goal: ${h(g.name)}</option>`), ...data.pots.map(p => `<option value="pot:${h(p.id)}">Savings pot: ${h(p.name)}</option>`)].join(""); $("#transferDestination").value = transfer.dataset.destination; $("#transferAmount").value = ""; $("#transferDirection").value = "add"; openModal("#transferModal"); }
  const edit = event.target.closest(".edit-transaction"); if (edit) { const transaction = data.transactions.find(item => String(item.id) === edit.dataset.id); if (!transaction) return; editingTransactionId = transaction.id; setTransactionType(transaction.type); ["amount", "date", "category", "payment", "frequency", "notes"].forEach(id => { $(`#${id}`).value = transaction[id] || ""; }); $("#transactionForm button[type=submit]").textContent = "Save changes"; openModal("#transactionModal"); }
  const remove = event.target.closest(".delete-transaction"); if (remove && confirm("Delete this transaction?")) { removeAutoTransfer(remove.dataset.id); data.transactions = data.transactions.filter(item => String(item.id) !== remove.dataset.id); save(); render(); toast("Transaction deleted."); }
  const goal = event.target.closest(".delete-goal"); if (goal && confirm("Delete this goal? Money saved in it returns to your balance.")) { data.transfers = data.transfers.filter(t => t.destination !== `goal:${goal.dataset.id}`); data.goals = data.goals.filter(item => String(item.id) !== goal.dataset.id); save(); render(); toast("Goal deleted. Saved money returned to your balance."); }
  const pot = event.target.closest(".delete-pot"); if (pot && confirm("Delete this savings pot? Money saved in it returns to your balance.")) { data.transfers = data.transfers.filter(t => t.destination !== `pot:${pot.dataset.id}`); data.pots = data.pots.filter(item => String(item.id) !== pot.dataset.id); save(); render(); toast("Pot deleted. Saved money returned to your balance."); }
  const budget = event.target.closest(".delete-budget"); if (budget && confirm("Delete this budget?")) { data.budgets = data.budgets.filter(item => item.category !== budget.dataset.category); save(); render(); toast("Budget deleted."); }
});
$$(".type-toggle button").forEach(button => button.onclick = () => setTransactionType(button.dataset.type));
$("#transactionForm").onsubmit = event => { event.preventDefault(); const amount = number($("#amount").value); const date = $("#date").value; if (!(amount > 0) || !date || dateAtNoon(date).toString() === "Invalid Date") { toast("Enter a valid amount and date."); return; } const record = { id: editingTransactionId || `tx-${Date.now()}`, type: currentType, amount, date, category: $("#category").value, payment: $("#payment").value, frequency: $("#frequency").value, notes: $("#notes").value.trim().slice(0, 240), generated: false, sourceId: null, occurrence: null };
  if (editingTransactionId) { const index = data.transactions.findIndex(item => item.id === editingTransactionId); if (index >= 0) { const old = data.transactions[index]; data.transactions[index] = { ...old, ...record, generated: old.generated, sourceId: old.sourceId, occurrence: old.occurrence, frequency: old.generated ? old.frequency : record.frequency }; removeAutoTransfer(old.id); if (record.type === "income") applySavingsRule(data.transactions[index]); } toast("Transaction updated."); } else { data.transactions.push(record); if (record.type === "income") applySavingsRule(record); toast(record.type === "income" && data.rule.type !== "off" ? "Income added — savings rule applied." : "Transaction added."); } save(); render(); closeModals(); event.target.reset(); editingTransactionId = null; };
$("#goalForm").onsubmit = event => { event.preventDefault(); const target = number($("#goalTarget").value); if (!(target > 0) || !$("#goalDeadline").value) return toast("Enter a valid target and deadline."); data.goals.push({ id: `goal-${Date.now()}`, name: $("#goalName").value.trim().slice(0, 80), target, saved: 0, deadline: $("#goalDeadline").value, created: dateKey(today) }); save(); render(); closeModals(); event.target.reset(); toast("Goal created. You’ve got this!"); };
$("#potForm").onsubmit = event => { event.preventDefault(); const target = number($("#potTarget").value); if (!(target > 0) || !$("#potName").value.trim()) return toast("Enter a valid pot name and target."); data.pots.push({ id: `pot-${Date.now()}`, name: $("#potName").value.trim().slice(0, 80), target, saved: 0, color: $("#potColor").value }); save(); render(); closeModals(); event.target.reset(); toast("Savings pot created."); };
$("#budgetForm").onsubmit = event => { event.preventDefault(); const category = $("#budgetCategory").value; const amount = number($("#budgetAmount").value); if (!(amount > 0)) return toast("Enter a valid budget."); const existing = data.budgets.find(item => item.category === category); if (existing) existing.amount = amount; else data.budgets.push({ category, amount }); save(); render(); closeModals(); event.target.reset(); toast("Budget saved."); };
$("#transferForm").onsubmit = event => { event.preventDefault(); const withdraw = $("#transferDirection").value === "withdraw"; const amount = number($("#transferAmount").value); const destination = $("#transferDestination").value; const [type, id] = destination.split(":"); const collection = type === "goal" ? data.goals : data.pots; const item = collection.find(value => String(value.id) === id); if (!item) return toast("Choose a savings destination."); if (!(amount > 0)) return toast("Enter a valid amount."); if (withdraw && amount > item.saved) return toast("You can't withdraw more than is saved there."); if (!withdraw && amount > allBalance()) return toast("Transfer amount exceeds your available balance."); item.saved += withdraw ? -amount : amount; data.transfers.push({ id: `transfer-${Date.now()}`, amount: withdraw ? -amount : amount, date: dateKey(today), destination }); save(); render(); closeModals(); event.target.reset(); toast(withdraw ? "Money moved back to your balance." : "Money transferred to savings."); };
$("#ruleForm").onsubmit = event => { event.preventDefault(); const amount = number($("#ruleAmount").value); if (!(amount > 0) || ($("#ruleType").value === "percent" && amount > 100)) return toast("Enter a valid savings rule."); data.rule = { amount, type: $("#ruleType").value }; save(); render(); closeModals(); toast("Savings rule updated."); };
$("#saveSettingsBtn").onclick = () => { data.settings = { ...data.settings, name: $("#profileName").value.trim().slice(0, 80), currency: $("#currencySelect").value }; save(); render(); closeModals(); toast("Settings saved."); };
$("#changePasswordBtn").onclick = changePassword;
$("#logoutBtn").onclick = lockApp;
$("#exportBackupBtn").onclick = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `pennywise-backup-${dateKey(today)}.json`; link.click(); URL.revokeObjectURL(link.href); data.settings.lastBackup = new Date().toISOString(); save(); renderBackupNotice(); toast("Backup exported."); };
$("#importBackupBtn").onclick = () => $("#importBackupInput").click();
$("#importBackupInput").onchange = event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = cleanData(JSON.parse(reader.result)); if (!confirm(`Replace your current data with this backup (${incoming.transactions.length} transactions)?`)) return; data = incoming; save(); render(); closeModals(); toast("Backup imported."); } catch (error) { console.warn("Backup import rejected.", error); toast("Could not import this backup."); } }; reader.readAsText(file); event.target.value = ""; };
$("#resetDataBtn").onclick = () => { if (confirm("Reset all your data? This can’t be undone. Export a backup first if you’re unsure.")) { data = cleanData(seed); save(); render(); closeModals(); toast("Data reset."); } };
$$(".segmented button").forEach(button => button.onclick = () => { $$(".segmented button").forEach(item => item.classList.remove("active")); button.classList.add("active"); currentFilter = button.dataset.filter; transactionLimit = 25; renderTransactions(); }); $("#transactionSearch").oninput = () => { transactionLimit = 25; renderTransactions(); }; $("#transactionSort").onchange = () => { transactionLimit = 25; renderTransactions(); }; $("#showMoreTransactions").onclick = () => { transactionLimit += 25; renderTransactions(); };
$("#exportBtn").onclick = () => { const rows = [["Type", "Date", "Category", "Amount", "Payment method", "Frequency", "Notes"], ...data.transactions.map(t => [t.type, t.date, t.category, t.amount, t.payment, t.frequency, t.notes])]; const safe = value => { const text = String(value); return /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? "'" + text : text; }; const csv = rows.map(row => row.map(value => `"${safe(value).replaceAll('"', '""')}"`).join(",")).join("\r\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = "pennywise-transactions.csv"; link.click(); URL.revokeObjectURL(link.href); toast("CSV export downloaded."); };

$("#todayLabel").textContent = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase(); $("#date").value = dateKey(today);
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
initAuth();

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(error => console.warn("Offline mode unavailable.", error));
