/* Pennywise — daily-use features: theme, categories, recurring manager, CSV import, split, safe-to-spend, welcome guide */

/* ---------- Theme ---------- */
function currentTheme() { try { return localStorage.getItem("pennywise-theme") || "dark"; } catch (error) { return "dark"; } }
function setTheme(theme) {
  theme = theme === "light" ? "light" : "dark";
  try { localStorage.setItem("pennywise-theme", theme); } catch (error) { /* private mode */ }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f7f7f3" : "#10171a");
  if ($("#themeSelect")) $("#themeSelect").value = theme;
}
setTheme(currentTheme());
$("#themeToggle").onclick = () => setTheme(currentTheme() === "dark" ? "light" : "dark");

/* ---------- Helpers ---------- */
const openOnly = selector => { closeModals(); openModal(selector); };
const refreshAll = () => { save(); render(); };
const catIconChoices = ["home", "food", "transport", "bills", "health", "shopping", "gift", "sparkles", "savings", "goals", "pencil", "book", "plane", "wifi", "coffee", "heart", "fuel", "paw", "dumbbell", "overview"];

/* ---------- Categories manager ---------- */
let catKind = "expense"; let newCatIcon = "sparkles";
function openCategories(kind) {
  catKind = kind === "income" ? "income" : "expense";
  $$("#catKindToggle button").forEach(button => button.classList.toggle("active", button.dataset.kind === catKind));
  renderCategoryEditor(); openOnly("#categoriesModal");
}
function renderCategoryEditor() {
  const list = data.categories[catKind];
  $("#categoryEditor").innerHTML = list.map((c, i) => {
    const uses = data.transactions.filter(t => t.type === catKind && t.category === c.name).length; const locked = c.name === "Other";
    return `<div class="cat-row" data-index="${i}"><input type="color" value="${h(c.color)}" data-cat-color aria-label="Color"><button type="button" class="cat-icon-btn" data-cat-icon aria-label="Icon">${iconMarkup(c.icon)}</button><input class="cat-name" value="${h(tr(c.name))}" maxlength="40" data-cat-name ${locked ? "readonly" : ""}><span class="cat-count">${uses}</span>${locked ? `<span class="cat-lock">${h(tr("Default"))}</span>` : `<button type="button" class="text-btn" data-cat-delete>${h(tr("Delete"))}</button>`}</div>`;
  }).join("");
  $("#newCatIcon").innerHTML = iconMarkup(newCatIcon);
}
$$("#catKindToggle button").forEach(button => button.onclick = () => openCategories(button.dataset.kind));
$("#categoryEditor").addEventListener("change", event => {
  const row = event.target.closest(".cat-row"); if (!row) return; const category = data.categories[catKind][Number(row.dataset.index)]; if (!category) return;
  if (event.target.matches("[data-cat-color]")) { pushUndo(); category.color = event.target.value; refreshAll(); renderCategoryEditor(); return; }
  if (event.target.matches("[data-cat-name]")) {
    const next = event.target.value.trim().slice(0, 40);
    if (!next || next === tr(category.name) || next === category.name) { renderCategoryEditor(); return; }
    if (data.categories[catKind].some(c => c !== category && c.name.toLowerCase() === next.toLowerCase())) { toast("A category with that name already exists.", "error"); renderCategoryEditor(); return; }
    pushUndo(); const previous = category.name; category.name = next;
    data.transactions.forEach(t => { if (t.type === catKind && t.category === previous) t.category = next; });
    if (catKind === "expense") data.budgets.forEach(b => { if (b.category === previous) b.category = next; });
    refreshAll(); renderCategoryEditor(); toast("Category renamed.", "success", { undo: true });
  }
});
$("#categoryEditor").addEventListener("click", event => {
  const row = event.target.closest(".cat-row"); if (!row) return; const index = Number(row.dataset.index); const category = data.categories[catKind][index]; if (!category) return;
  if (event.target.closest("[data-cat-icon]")) { pushUndo(); category.icon = catIconChoices[(catIconChoices.indexOf(category.icon) + 1) % catIconChoices.length]; refreshAll(); renderCategoryEditor(); }
  if (event.target.closest("[data-cat-delete]")) {
    pushUndo(); const removed = category.name;
    data.transactions.forEach(t => { if (t.type === catKind && t.category === removed) t.category = "Other"; });
    if (catKind === "expense") data.budgets = data.budgets.filter(b => b.category !== removed);
    data.categories[catKind].splice(index, 1); refreshAll(); renderCategoryEditor(); toast("Category deleted. Its transactions moved to “Other”.", "success", { undo: true });
  }
});
$("#newCatIcon").onclick = () => { newCatIcon = catIconChoices[(catIconChoices.indexOf(newCatIcon) + 1) % catIconChoices.length]; $("#newCatIcon").innerHTML = iconMarkup(newCatIcon); };
$("#newCategoryForm").onsubmit = event => {
  event.preventDefault(); const name = $("#newCatName").value.trim().slice(0, 40); if (!name) return;
  if (data.categories[catKind].some(c => c.name.toLowerCase() === name.toLowerCase() || tr(c.name).toLowerCase() === name.toLowerCase())) { toast("A category with that name already exists.", "error"); return; }
  pushUndo(); const other = data.categories[catKind].findIndex(c => c.name === "Other");
  data.categories[catKind].splice(other < 0 ? data.categories[catKind].length : other, 0, { name, color: $("#newCatColor").value, icon: newCatIcon });
  $("#newCatName").value = ""; $("#newCatColor").value = categoryPalette[data.categories[catKind].length % categoryPalette.length]; refreshAll(); renderCategoryEditor(); toast("Category added.", "success", { undo: true });
};
$("#openCategoriesBtn").onclick = () => openCategories("expense");
$("#manageCategoriesLink").onclick = () => openCategories(currentType);

/* ---------- Recurring manager ---------- */
function recurringSources() { return data.transactions.filter(t => !t.generated && t.frequency !== "One-time").sort((a, b) => (a.type === b.type ? a.category.localeCompare(b.category) : a.type === "income" ? -1 : 1)); }
function nextOccurrence(source) {
  for (let n = 1; n < 2000; n += 1) { const date = recurringDate(source, n); const key = dateKey(date); if (source.endDate && key > source.endDate) return null; if (date > today) return key; }
  return null;
}
function renderRecurring() {
  const sources = recurringSources();
  $("#recurringList").innerHTML = sources.map(src => {
    const next = src.paused ? null : nextOccurrence(src); const state = src.paused ? "paused" : (src.endDate && !next) ? "ended" : "active";
    const stateLabel = { active: "Active", paused: "Paused", ended: "Ended" }[state];
    const nextText = state === "active" ? tr("Next: {d}", { d: dateAtNoon(next).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" }) }) : "";
    const toggle = state === "active" ? "Pause" : state === "paused" ? "Resume" : "Restart";
    return `<div class="rec-row"><div class="rec-main"><strong>${iconMarkup(icons[src.category] || "overview")} ${h(src.category)}</strong><small>${h(src.notes || tr(src.payment))} · ${h(tr(src.frequency))}</small></div><div class="rec-amount ${src.type}"><bdi dir="ltr">${h((src.type === "income" ? "+" : "−") + money(src.amount))}</bdi></div><div class="rec-state"><span class="rec-chip ${state}">${stateLabel}</span><small>${h(nextText)}</small></div><div class="rec-actions"><button type="button" class="text-btn" data-rec="toggle" data-id="${h(src.id)}">${toggle}</button><button type="button" class="text-btn" data-rec="edit" data-id="${h(src.id)}">Edit</button>${state === "ended" ? "" : `<button type="button" class="text-btn" data-rec="end" data-id="${h(src.id)}">End</button>`}<button type="button" class="text-btn" data-rec="delete" data-id="${h(src.id)}">Delete</button></div></div>`;
  }).join("") || `<p class="muted">${h(tr("No recurring transactions yet."))}</p>`;
}
function openRecurring() { renderRecurring(); openOnly("#recurringModal"); }
$("#recurringList").addEventListener("click", event => {
  const button = event.target.closest("[data-rec]"); if (!button) return; const source = data.transactions.find(t => String(t.id) === button.dataset.id); if (!source) return;
  const action = button.dataset.rec;
  if (action === "edit") { closeModals(); const proxy = document.createElement("button"); proxy.className = "edit-transaction"; proxy.dataset.id = source.id; document.body.appendChild(proxy); proxy.click(); proxy.remove(); return; }
  pushUndo();
  if (action === "toggle") { if (source.paused || source.endDate) { source.paused = false; source.endDate = null; source.resumeFrom = dateKey(today); } else source.paused = true; }
  if (action === "end") { source.endDate = dateKey(today); source.paused = false; }
  if (action === "delete") data.transactions = data.transactions.filter(t => t !== source);
  refreshAll(); renderRecurring(); toast("Recurring updated.", "success", { undo: true });
});
$("#recurringBtn").onclick = openRecurring; $("#openRecurringBtn").onclick = openRecurring;

/* ---------- Transaction filters ---------- */
["#filterFrom", "#filterTo", "#filterCategory", "#filterTag", "#filterAccount"].forEach(id => { $(id).onchange = () => { transactionLimit = 25; renderTransactions(); }; });
$("#clearFilters").onclick = () => { ["#filterFrom", "#filterTo", "#filterCategory", "#filterTag", "#filterAccount", "#transactionSearch"].forEach(id => { $(id).value = ""; }); transactionLimit = 25; renderTransactions(); };

/* ---------- Split an expense ---------- */
function setSplitVisible(visible) { $("#splitBox").hidden = !visible; }
function resetSplit() { $("#splitToggle").checked = false; $("#splitRows").hidden = true; $("#splitList").innerHTML = ""; $("#splitRemaining").textContent = ""; setSplitVisible(true); }
function updateSplitAvailability() { setSplitVisible(currentType === "expense" && !editingTransactionId); if (currentType !== "expense") { $("#splitToggle").checked = false; $("#splitRows").hidden = true; } }
function addSplitRow() {
  const row = document.createElement("div"); row.className = "split-row";
  row.innerHTML = `<select class="split-cat">${expenseCategories.map(c => `<option value="${h(c)}">${h(c)}</option>`).join("")}</select><input type="number" class="split-amount" min="0.01" step="0.01" placeholder="0.00"><button type="button" class="text-btn" data-split-remove aria-label="Remove">×</button>`;
  $("#splitList").appendChild(row);
}
function updateSplitRemaining() {
  const total = number($("#amount").value); const used = [...$$(".split-amount")].reduce((sum, input) => sum + number(input.value), 0);
  const left = total - used; const label = $("#splitRemaining");
  label.textContent = total ? tr("Remaining for {c}: {m}", { c: tr($("#category").value || "Other"), m: money(left) }) : ""; label.classList.toggle("bad", total > 0 && left <= 0);
}
function readSplitRows() {
  if (!$("#splitToggle").checked) return [];
  return $$(".split-row").map(row => ({ category: row.querySelector(".split-cat").value, amount: number(row.querySelector(".split-amount").value) })).filter(part => part.amount > 0);
}
$("#splitToggle").onchange = () => { $("#splitRows").hidden = !$("#splitToggle").checked; if ($("#splitToggle").checked && !$("#splitList").children.length) addSplitRow(); updateSplitRemaining(); };
$("#addSplitRow").onclick = addSplitRow;
$("#splitList").addEventListener("click", event => { if (event.target.closest("[data-split-remove]")) { event.target.closest(".split-row").remove(); updateSplitRemaining(); } });
["input", "change"].forEach(type => $("#transactionForm").addEventListener(type, event => { if (event.target.matches("#amount, #category, .split-amount, .split-cat")) updateSplitRemaining(); }));

/* ---------- Monthly limit and safe-to-spend ---------- */
function monthlyLimit() { return data.monthlyLimit || data.budgets.reduce((sum, b) => sum + b.amount, 0); }
function openLimit() { $("#limitAmount").value = data.monthlyLimit || ""; openOnly("#limitModal"); }
$("#setLimitBtn").onclick = openLimit;
$("#limitForm").onsubmit = event => { event.preventDefault(); pushUndo(); data.monthlyLimit = Math.max(0, number($("#limitAmount").value)); refreshAll(); closeModals(); toast("Monthly limit saved.", "success", { undo: true }); };
function renderSafeCard() {
  const el = $("#safeCard"); if (!el) return;
  if (!isCurrentMonth()) { el.innerHTML = ""; return; }
  const limit = monthlyLimit();
  if (!limit) { el.innerHTML = `<div class="safe-card"><div><strong>Safe to spend today</strong><small>Set a monthly spending limit to see how much you can spend each day.</small></div><button class="secondary-btn" id="safeSetLimit" type="button">Set a limit</button></div>`; $("#safeSetLimit").onclick = openLimit; return; }
  const spent = totals(data.transactions.filter(thisMonth)).expense; const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(); const daysLeft = daysInMonth - today.getDate() + 1;
  const remaining = limit - spent; const perDay = Math.max(0, remaining) / daysLeft; const pct = Math.min(100, Math.round(spent / limit * 100));
  el.innerHTML = `<div class="safe-card ${remaining < 0 ? "over" : ""}"><div><small>${h(tr("Safe to spend today"))}</small><strong class="safe-amount">${h(money(perDay))}</strong><small>${h(remaining < 0 ? tr("You’re {m} over your monthly limit.", { m: money(-remaining) }) : tr("{m} left this month · {d} days to go", { m: money(remaining), d: daysLeft }))}</small></div><div class="safe-meter"><div class="progress"><span style="width:${pct}%;background:${remaining < 0 ? "var(--coral)" : "var(--teal)"}"></span></div><small>${h(tr("{p}% of your {m} limit", { p: pct, m: money(limit) }))}</small></div></div>`;
}

/* ---------- Bank CSV import ---------- */
const csvState = { rows: [], header: [] };
function parseCSV(text) {
  text = text.replace(/^\ufeff/, ""); const first = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = [";", "\t", ","].map(d => [d, first.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); cell = ""; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row); return rows;
}
function parseAmount(raw) {
  let s = String(raw ?? "").trim(); if (!s) return NaN; let negative = /^\(.*\)$/.test(s) || /^[-−–]/.test(s) || /[-−]$/.test(s) || /\bDR\b/i.test(s);
  s = s.replace(/[^\d.,]/g, ""); if (!s) return NaN;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (lastComma >= 0) s = /,\d{1,2}$/.test(s) && s.split(",").length === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const value = parseFloat(s); return Number.isFinite(value) ? (negative ? -value : value) : NaN;
}
function parseCsvDate(raw, format) {
  const s = String(raw || "").trim(); let m, y, mo, d;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))) { const a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000; if (format === "mdy") { mo = a; d = b; } else if (format === "dmy") { d = a; mo = b; } else if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else { d = a; mo = b; } }
  else return null;
  const date = new Date(y, mo - 1, d, 12); if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null; return dateKey(date);
}
const csvKeywords = {
  expense: { Food: ["restaurant", "resto", "cafe", "café", "pizza", "burger", "supermarch", "marjane", "carrefour", "bim ", "aswak", "glovo", "boulang", "epicerie", "grocery", "mcdonald"], Transport: ["taxi", "uber", "careem", "indrive", "tram", "oncf", "carburant", "petrol", "afriquia", "shell", "autoroute", "parking"], Bills: ["maroc telecom", "iam ", "orange", "inwi", "lydec", "redal", "amendis", "onee", "electricit", "eau ", "internet", "facture"], Health: ["pharmac", "clinique", "docteur", "dr ", "hopital", "laborat"], Subscriptions: ["netflix", "spotify", "youtube", "apple.com", "google", "openai", "abonnement", "subscription"], Shopping: ["zara", "amazon", "h&m", "decathlon", "jumia", "kiabi", "ikea"], Rent: ["loyer", "rent"] },
  income: { Salary: ["salaire", "salary", "paie", "payroll"], Refunds: ["remboursement", "refund"] }
};
function guessCategory(type, text, columnValue, fallback) {
  const list = type === "income" ? incomeCategories : expenseCategories; const lower = String(text || "").toLowerCase();
  const direct = list.find(c => c.toLowerCase() === String(columnValue || "").trim().toLowerCase()); if (direct) return direct;
  for (const [name, words] of Object.entries(csvKeywords[type])) if (list.includes(name) && words.some(w => lower.includes(w))) return name;
  return fallback;
}
function openCsv() { csvState.rows = []; $("#csvMapping").hidden = true; $("#csvFile").value = ""; openOnly("#csvModal"); }
$("#openCsvBtn").onclick = openCsv; $("#importCsvBtn").onclick = openCsv; $("#csvChooseBtn").onclick = () => $("#csvFile").click();
$("#csvFile").onchange = event => {
  const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result || "")); if (rows.length < 2) { toast("Choose a CSV file with a header row.", "error"); return; }
    csvState.header = rows[0].map(x => x.trim()); csvState.rows = rows.slice(1);
    const options = ['<option value="">— none —</option>', ...csvState.header.map((name, i) => `<option value="${i}">${h(name || `#${i + 1}`)}</option>`)].join("");
    const used = new Set(); const find = pattern => { const i = csvState.header.findIndex((name, idx) => !used.has(idx) && pattern.test(name)); if (i >= 0) used.add(i); return i >= 0 ? String(i) : ""; };
    const detect = {}; detect.mapDate = find(/date|jour|datum|تاريخ/i); detect.mapDebit = find(/d[eé]bit|retrait|withdraw|مدين/i); detect.mapCredit = find(/cr[eé]dit|d[eé]p[oô]t|deposit|دائن/i); detect.mapAmount = find(/montant|amount|somme|valeur|المبلغ/i); detect.mapCategory = find(/categor|cat[eé]gorie|فئة/i); detect.mapDesc = find(/desc|libell|label|detail|memo|narr|objet|op[eé]ration|operation|بيان|وصف/i);
    Object.keys(detect).forEach(id => { $(`#${id}`).innerHTML = options; $(`#${id}`).value = detect[id]; });
    $("#csvExpenseCat").innerHTML = expenseCategories.map(c => `<option value="${h(c)}">${h(c)}</option>`).join(""); $("#csvExpenseCat").value = expenseCategories.includes("Other") ? "Other" : expenseCategories[0];
    $("#csvIncomeCat").innerHTML = incomeCategories.map(c => `<option value="${h(c)}">${h(c)}</option>`).join(""); $("#csvIncomeCat").value = incomeCategories.includes("Other") ? "Other" : incomeCategories[0];
    $("#csvMapping").hidden = false; renderCsvPreview();
  };
  reader.onerror = () => toast("Could not read this file.", "error"); reader.readAsText(file);
};
function csvCandidates() {
  const col = id => { const v = $(`#${id}`).value; return v === "" ? -1 : Number(v); };
  const c = { date: col("mapDate"), desc: col("mapDesc"), amount: col("mapAmount"), cat: col("mapCategory"), debit: col("mapDebit"), credit: col("mapCredit") };
  const format = $("#csvDateFormat").value, positiveIsExpense = $("#csvSign").value === "positive";
  const existing = new Set(data.transactions.map(t => `${t.date}|${t.type}|${t.amount.toFixed(2)}|${t.notes.toLowerCase()}`)); const seen = new Set();
  const out = []; let skipped = 0, duplicates = 0;
  if (c.date < 0 || (c.amount < 0 && c.debit < 0 && c.credit < 0)) return { out, skipped, duplicates, invalid: true };
  csvState.rows.forEach(row => {
    const date = parseCsvDate(row[c.date], format); let type, amount;
    if (c.debit >= 0 || c.credit >= 0) { const debit = Math.abs(parseAmount(row[c.debit] ?? "")) || 0, credit = Math.abs(parseAmount(row[c.credit] ?? "")) || 0; if (credit > 0 && debit === 0) { type = "income"; amount = credit; } else if (debit > 0 && credit === 0) { type = "expense"; amount = debit; } }
    if (!type && c.amount >= 0) { const value = parseAmount(row[c.amount]); if (Number.isFinite(value) && value !== 0) { const negative = value < 0; type = (negative !== positiveIsExpense) ? "expense" : "income"; amount = Math.abs(value); } }
    if (!date || !type || !amount) { skipped += 1; return; }
    const notes = String(c.desc >= 0 ? row[c.desc] : "").replace(/\s+/g, " ").trim().slice(0, 240);
    const key = `${date}|${type}|${amount.toFixed(2)}|${notes.toLowerCase()}`; if (existing.has(key) || seen.has(key)) { duplicates += 1; return; } seen.add(key);
    out.push({ date, type, amount: Math.round(amount * 100) / 100, notes, category: guessCategory(type, notes, c.cat >= 0 ? row[c.cat] : "", type === "income" ? $("#csvIncomeCat").value : $("#csvExpenseCat").value) });
  });
  return { out, skipped, duplicates, invalid: false };
}
function renderCsvPreview() {
  const result = csvCandidates(); const box = $("#csvPreview"); $("#csvImportBtn").disabled = result.invalid || !result.out.length;
  if (result.invalid) { box.innerHTML = `<p class="muted">${h(tr("Choose the date column and an amount (or debit/credit) column."))}</p>`; return; }
  const rows = result.out.slice(0, 6).map(t => `<tr><td>${h(t.date)}</td><td>${h(t.notes || "—")}</td><td>${h(t.category)}</td><td class="num ${t.type}"><bdi dir="ltr">${h((t.type === "income" ? "+" : "−") + money(t.amount))}</bdi></td></tr>`).join("");
  box.innerHTML = `<p class="csv-summary"><strong>${h(tr("{n} ready to import", { n: result.out.length }))}</strong> · ${h(tr("{n} duplicates skipped", { n: result.duplicates }))} · ${h(tr("{n} rows skipped", { n: result.skipped }))}</p>${rows ? `<div class="rp-table-wrap"><table class="csv-table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}`;
}
["mapDate", "mapDesc", "mapAmount", "mapCategory", "mapDebit", "mapCredit", "csvDateFormat", "csvSign", "csvExpenseCat", "csvIncomeCat"].forEach(id => { $(`#${id}`).onchange = renderCsvPreview; });
$("#csvImportBtn").onclick = () => {
  const result = csvCandidates(); if (!result.out.length) return; pushUndo(); const stamp = Date.now();
  const account = data.accounts.some(a => a.id === $("#csvAccount").value) ? $("#csvAccount").value : data.accounts[0].id;
  result.out.forEach((t, i) => data.transactions.push({ id: `csv-${stamp}-${i}`, account, type: t.type, amount: t.amount, date: t.date, category: t.category, payment: "Bank transfer", frequency: "One-time", notes: t.notes, tags: ["imported"], generated: false, sourceId: null, occurrence: null, splitId: null, paused: false, resumeFrom: null, endDate: null }));
  refreshAll(); closeModals(); toast(tr("{n} transactions imported.", { n: result.out.length }), "success", { undo: true });
};

/* ---------- Welcome guide ---------- */
let welcomeStep = 1; let onboardShown = false;
function showWelcomeStep(step) {
  welcomeStep = step; $$(".welcome-step").forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
  $$(".welcome-dots i").forEach((dot, i) => dot.classList.toggle("on", i === step - 1));
  $("#welcomeBack").hidden = step === 1; $("#welcomeNext").textContent = step === 3 ? "Get started" : "Next";
}
function finishWelcome(apply) {
  if (apply) { data.settings.name = $("#welcomeName").value.trim().slice(0, 80) || data.settings.name; data.settings.currency = $("#welcomeCurrency").value; const limit = number($("#welcomeLimit").value); if (limit > 0) data.monthlyLimit = limit; refreshAll(); }
  closeModals();
}
function maybeOnboard() {
  if (onboardShown || !unlocked || data.onboarded || data.transactions.length) return; onboardShown = true; data.onboarded = true; save();
  $("#welcomeName").value = data.settings.name || ""; $("#welcomeCurrency").value = data.settings.currency; $("#welcomeLimit").value = ""; showWelcomeStep(1); openModal("#welcomeModal");
}
$("#welcomeNext").onclick = () => { if (welcomeStep < 3) showWelcomeStep(welcomeStep + 1); else finishWelcome(true); };
$("#welcomeBack").onclick = () => showWelcomeStep(Math.max(1, welcomeStep - 1));
$("#welcomeSkip").onclick = () => finishWelcome(false);

/* ---------- Savings activity log ---------- */
function renderSavingsLog() {
  const box = $("#savingsLog"); if (!box) return;
  const name = destination => { const [type, id] = String(destination).split(":"); const item = (type === "goal" ? data.goals : data.pots).find(x => String(x.id) === id); return item ? item.name : tr("Deleted"); };
  const rows = [...data.transfers].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id))).slice(0, 10).map(t => {
    const out = t.amount < 0; const label = t.automatic || String(t.id).startsWith("rule-") ? tr("Auto-saved to {d}", { d: name(t.destination) }) : out ? tr("Withdrawn from {d}", { d: name(t.destination) }) : tr("Moved to {d}", { d: name(t.destination) });
    return `<div class="log-row"><span class="log-date">${h(dateAtNoon(t.date).toLocaleDateString(locale(), { month: "short", day: "numeric" }))}</span><span class="log-label">${h(label)}</span><strong class="${out ? "income" : "expense"}"><bdi dir="ltr">${h((out ? "+" : "−") + money(Math.abs(t.amount)))}</bdi></strong></div>`;
  }).join("");
  box.innerHTML = rows || emptyState("savings", "No savings movements yet.", "Move money into a pot or goal and it will show up here.");
}
/* Navigating away dismisses the Undo message so it can never be tapped by accident */
document.addEventListener("click", event => { if (event.target.closest("[data-view], #mobileMenuBtn, .sidebar")) $("#toast").classList.remove("show"); }, true);

/* Empty-state buttons and bottom-nav syncing */
document.addEventListener("click", event => {
  const empty = event.target.closest("[data-empty-action]"); if (empty) { const map = { transaction: "#addTransactionBtn", goal: "#addGoalBtn", pot: "#addPotBtn", budget: "#addBudgetBtn" }; $(map[empty.dataset.emptyAction])?.click(); }
  const nav = event.target.closest(".nav-item"); if (nav) { $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === nav.dataset.view)); window.scrollTo({ top: 0 }); }
});

function renderExtras() { renderSafeCard(); renderSavingsLog(); if (typeof renderAccounts === "function") renderAccounts(); if (typeof renderUpcoming === "function") renderUpcoming(); maybeOnboard(); }
