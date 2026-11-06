/* Pennywise — upcoming bills, subscriptions and due-date reminders */

const reminderChoices = [1, 3, 7, 14];
const horizonChoices = [7, 30, 60, 90];
let upcomingHorizon = 30;

const dayDiff = key => Math.round((dateAtNoon(key) - dateAtNoon(dateKey(today))) / 86400000);
const reminderWindow = () => reminderChoices.includes(data.settings.reminderDays) ? data.settings.reminderDays : 3;

// Future one-time items plus every coming occurrence of active recurring items, soonest first.
function upcomingItems(horizon = 30) {
  const startKey = dateKey(today), endKey = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + horizon, 12));
  const items = [];
  const add = (t, date, recurring) => items.push({ id: `${t.id}:${date}`, date, type: t.type, amount: t.amount, category: t.category, account: t.account, name: t.notes || tr(t.category), frequency: t.frequency, recurring });
  data.transactions.forEach(t => {
    if (t.generated) return;
    if (t.frequency === "One-time") { if (t.date > startKey && t.date <= endKey) add(t, t.date, false); return; }
    if (t.paused) return;
    const source = dateAtNoon(t.date);
    const skip = t.frequency === "Weekly" ? Math.floor((dateAtNoon(startKey) - source) / (7 * 86400000)) : (today.getFullYear() - source.getFullYear()) * 12 + today.getMonth() - source.getMonth() - 1;
    for (let n = Math.max(0, skip), last = n + 400; n < last; n += 1) {
      const key = dateKey(recurringDate(t, n));
      if (key > endKey || (t.endDate && key > t.endDate)) break;
      if (key < startKey || (t.resumeFrom && key < t.resumeFrom)) continue;
      add(t, key, true);
    }
  });
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? b.amount - a.amount : a.type === "expense" ? -1 : 1));
}

const dueText = diff => diff <= 0 ? tr("Today") : diff === 1 ? tr("Tomorrow") : tr("in {n} days", { n: diff });
const sumExpenses = items => items.filter(i => i.type === "expense").reduce((sum, i) => sum + i.amount, 0);

function recurringCosts() {
  const todayKey = dateKey(today);
  const active = data.transactions.filter(t => !t.generated && t.type === "expense" && t.frequency !== "One-time" && !t.paused && (!t.endDate || t.endDate >= todayKey));
  const monthly = list => list.reduce((sum, t) => sum + t.amount * (t.frequency === "Weekly" ? 52 / 12 : 1), 0);
  return { all: monthly(active), subscriptions: monthly(active.filter(t => t.category === "Subscriptions")) };
}

function renderUpcomingCard() {
  const menu = $("#upcomingPopover"); if (!menu) return;
  const items = upcomingItems(30), soon = reminderWindow();
  const due = items.filter(i => i.type === "expense" && dayDiff(i.date) <= soon).length;
  const badge = $("#bellBadge"); badge.hidden = !due; badge.textContent = due > 9 ? "9+" : String(due);
  $("#upcomingTrigger").setAttribute("aria-label", due ? tr("Upcoming") + ` (${due})` : tr("Upcoming"));
  const rows = items.slice(0, 5).map(i => {
    const diff = dayDiff(i.date), date = dateAtNoon(i.date);
    return `<div class="upcoming-row${diff <= soon ? " soon" : ""}"><span class="upcoming-date"><b>${h(date.toLocaleDateString(locale(), { day: "numeric" }))}</b>${h(date.toLocaleDateString(locale(), { month: "short" }))}</span><span class="upcoming-name"><strong>${h(i.name)}</strong><small>${h(dueText(diff))}${i.recurring ? ` · ${h(tr(i.frequency))}` : ""}</small></span><strong class="transaction-amount ${i.type}"><bdi dir="ltr">${h((i.type === "income" ? "+" : "−") + money(i.amount))}</bdi></strong></div>`;
  }).join("");
  const summary = items.length ? tr("{n} due in the next 30 days · {m}", { n: items.filter(i => i.type === "expense").length, m: money(sumExpenses(items)) }) : tr("Nothing due in the next 30 days.");
  menu.innerHTML = `<div class="pop-head"><strong>${h(tr("Upcoming"))}</strong><small>${h(summary)}</small></div>${rows}<div class="pop-actions"><button class="secondary-btn" type="button" data-open-upcoming>${h(tr("See all →"))}</button></div>`;
}
function renderUpcomingModal() {
  $("#upcomingHorizon").value = String(upcomingHorizon); $("#reminderDays").value = String(reminderWindow());
  const items = upcomingItems(upcomingHorizon), soon = reminderWindow();
  const expenses = items.filter(i => i.type === "expense");
  $("#upcomingSummary").textContent = items.length ? tr("{n} payments · {m} due", { n: expenses.length, m: money(sumExpenses(items)) }) : "";
  const groups = []; items.forEach(i => { const last = groups[groups.length - 1]; if (last && last.date === i.date) last.items.push(i); else groups.push({ date: i.date, items: [i] }); });
  $("#upcomingList").innerHTML = groups.map(g => {
    const diff = dayDiff(g.date);
    const rows = g.items.map(i => `<div class="upcoming-item"><span class="table-category-icon" style="--cat:${h(categoryColors[i.category] || "#b7c4bd")}">${iconMarkup(icons[i.category] || "overview")}</span><span class="upcoming-name"><strong>${h(i.name)}</strong><small>${h(tr(i.category))}${i.recurring ? ` · ${h(tr(i.frequency))}` : ""}${data.accounts.length > 1 ? ` · ${h(accountLabel(i.account))}` : ""}</small></span><strong class="transaction-amount ${i.type}"><bdi dir="ltr">${h((i.type === "income" ? "+" : "−") + money(i.amount))}</bdi></strong></div>`).join("");
    return `<section class="upcoming-day${diff <= soon ? " soon" : ""}"><header><strong>${h(dateAtNoon(g.date).toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" }))}</strong><span>${h(dueText(diff))}</span></header>${rows}</section>`;
  }).join("") || `<p class="muted upcoming-empty">${h(tr("Nothing is due in this period."))}</p>`;
  const costs = recurringCosts();
  $("#upcomingTotals").innerHTML = costs.all ? `<p>${h(tr("Recurring costs: about {m} per month", { m: money(costs.all) }))}</p>${costs.subscriptions ? `<p>${h(tr("Subscriptions: about {m} per month", { m: money(costs.subscriptions) }))}</p>` : ""}` : "";
}

function openUpcoming() { renderUpcomingModal(); openOnly("#upcomingModal"); }

function renderUpcoming() {
  renderUpcomingCard();
  if ($("#upcomingModal").classList.contains("open")) renderUpcomingModal();
}

document.addEventListener("click", event => { if (event.target.closest("[data-open-upcoming]")) openUpcoming(); });
$("#upcomingBtn").onclick = openUpcoming;
$("#upcomingHorizon").onchange = event => { const days = Number(event.target.value); upcomingHorizon = horizonChoices.includes(days) ? days : 30; renderUpcomingModal(); };
$("#reminderDays").onchange = event => { const days = Number(event.target.value); if (!reminderChoices.includes(days)) return; data.settings.reminderDays = days; refreshAll(); };
$("#upcomingRecurringBtn").onclick = openRecurring;
$("#upcomingAddBtn").onclick = () => { closeModals(); startTransaction(); $("#frequency").value = "Monthly"; };
