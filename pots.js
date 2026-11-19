/* Pennywise — savings pots ranked by importance.
   You choose the order: the first pot is the most important. A pot can have a "needed by" date as a reminder.
   Money never moves on its own. A pot that is short offers "Fill from less important pots": you see what
   each pot below it could give (least important first), adjust or untick, and confirm. Protected pots never give. */

const dueSoonDays = 30;
const round2 = value => Math.round(value * 100) / 100;
const daysUntil = key => Math.round((dateAtNoon(key) - dateAtNoon(todayKey())) / 86400000);
const potShort = pot => round2(Math.max(0, pot.target - pot.saved));
const potDueSoon = pot => { if (!pot.due || potShort(pot) <= 0) return false; const days = daysUntil(pot.due); return days >= 0 && days <= dueSoonDays; };

// What the less important pots could give, least important first, without overfilling the pot.
function fillPlan(pot) {
  const index = data.pots.indexOf(pot); let need = potShort(pot); const plan = [];
  for (let j = data.pots.length - 1; j > index && need > 0; j -= 1) {
    const donor = data.pots[j];
    if (donor.locked || donor.saved <= 0) continue;
    const amount = round2(Math.min(need, donor.saved)); need = round2(need - amount);
    plan.push({ donor, amount });
  }
  return plan;
}

// Moves money from one pot to another as a linked pair of transfers, so the balance never changes.
function movePotMoney(from, to, amount) {
  amount = round2(Math.min(amount, from.saved)); if (!(amount > 0)) return 0;
  from.saved = round2(from.saved - amount); to.saved = round2(to.saved + amount);
  const group = `move-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date = todayKey();
  data.transfers.push({ id: `${group}-out`, amount: -amount, date, destination: `pot:${from.id}`, group });
  data.transfers.push({ id: `${group}-in`, amount, date, destination: `pot:${to.id}`, group });
  return amount;
}

// Money this pot received from other pots in the last 7 days.
function recentTopUps(pot) {
  return data.transfers.filter(t => t.group && t.amount > 0 && t.destination === `pot:${pot.id}` && daysUntil(t.date) >= -7).reduce((sum, t) => sum + t.amount, 0);
}

function potCardMarkup(pot, index) {
  const pct = Math.min(100, Math.round(pot.saved / pot.target * 100));
  const color = pot.color === "coral" ? "var(--coral)" : pot.color === "purple" ? "var(--purple)" : pot.color === "yellow" ? "var(--yellow)" : "var(--teal)";
  const count = data.pots.length, short = potShort(pot), soon = potDueSoon(pot), received = recentTopUps(pot), canFill = short > 0 && fillPlan(pot).length > 0;
  let due = "";
  if (pot.due) {
    const days = daysUntil(pot.due), date = h(dateAtNoon(pot.due).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" }));
    const state = days < 0 ? tr("Was due {d}", { d: date }) : short <= 0 ? tr("Ready · needed by {d}", { d: date }) : days === 0 ? tr("Needed today · {m} short", { m: money(short) }) : tr("Needed by {d} · {n} days left", { d: date, n: days });
    due = `<p class="pot-due${soon ? " short" : short <= 0 && days >= 0 ? " ready" : ""}">${iconMarkup("bell")}<span>${h(state)}</span></p>`;
  }
  const note = received ? `<span class="pot-note received">${h(tr("Received {m} from less important pots", { m: money(received) }))}</span>` : "";
  // Prominent when the pot is needed soon, a quiet link otherwise: you can always fill a short pot.
  const fill = canFill ? `<button type="button" class="${soon ? "secondary-btn" : "text-btn quiet"} fill-pot" data-id="${h(pot.id)}">${h(tr("Fill from less important pots"))}</button>` : "";
  return `<div class="pot-card${pct >= 100 ? " full" : ""}${soon ? " due-soon" : ""}" style="--c:${color};--pct:${pct}">
    <div class="pot-head"><span class="pot-rank" title="${h(tr("Importance"))}">#${index + 1}</span><span class="pot-icon ${h(pot.color)}">${iconMarkup("savings")}</span>
      <span class="pot-order"><button type="button" class="icon-btn pot-move" data-dir="-1" data-id="${h(pot.id)}" aria-label="${h(tr("More important"))}" title="${h(tr("More important"))}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="icon-btn pot-move" data-dir="1" data-id="${h(pot.id)}" aria-label="${h(tr("Less important"))}" title="${h(tr("Less important"))}" ${index === count - 1 ? "disabled" : ""}>↓</button></span>
      <span class="mini-ring" style="--pct:${pct}"><b>${pct}%</b></span></div>
    <h3>${h(pot.name)}${pot.locked ? ` <span class="badge pot-lock">${h(tr("Protected"))}</span>` : ""}</h3>
    <div class="pot-amount">${money(pot.saved)} <span>${h(tr("of {m}", { m: money(pot.target) }))}</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    ${due}${note}${fill}
    <div class="pot-footer"><span>${h(tr("Progress"))}</span><strong>${h(tr("{m} to go", { m: money(short) }))}</strong></div>
    <div class="pot-actions"><button class="text-btn transfer-btn" data-destination="pot:${h(pot.id)}">＋ ${h(tr("Move money"))}</button><button class="text-btn edit-pot" data-id="${h(pot.id)}">${h(tr("Edit"))}</button><button class="text-btn delete-pot" data-id="${h(pot.id)}">${h(tr("Delete"))}</button></div>
  </div>`;
}

/* ---------- Fill from less important pots (you confirm every move) ---------- */
let fillingPotId = null;
function openFill(pot) {
  fillingPotId = pot.id;
  $("#fillTitle").textContent = tr("Fill {n}", { n: pot.name });
  $("#fillIntro").textContent = tr("{n} needs {m}. Choose what each less important pot gives.", { n: pot.name, m: money(potShort(pot)) });
  $("#fillList").innerHTML = fillPlan(pot).map(({ donor, amount }) => `<div class="fill-row"><label class="check-row"><input type="checkbox" checked data-donor="${h(donor.id)}"> <span><strong>${h(donor.name)}</strong> <small class="muted">#${data.pots.indexOf(donor) + 1} · ${h(tr("{m} saved", { m: money(donor.saved) }))}</small></span></label><input type="number" min="0" step="0.01" max="${donor.saved}" value="${amount}" data-amount="${h(donor.id)}" aria-label="${h(tr("Amount from {n}", { n: donor.name }))}"></div>`).join("");
  updateFillTotal(); openModal("#fillModal");
}
function fillChoices() {
  return $$("#fillList .fill-row").map(row => {
    const id = row.querySelector("[data-donor]").dataset.donor, donor = data.pots.find(p => String(p.id) === id);
    return { donor, amount: row.querySelector("[data-donor]").checked ? round2(Math.max(0, number(row.querySelector("[data-amount]").value))) : 0 };
  }).filter(c => c.donor && c.amount > 0);
}
function updateFillTotal() {
  const pot = data.pots.find(p => p.id === fillingPotId); if (!pot) return;
  const total = fillChoices().reduce((sum, c) => sum + Math.min(c.amount, c.donor.saved), 0);
  $("#fillTotal").textContent = tr("Moving {m} · {r} still needed", { m: money(total), r: money(Math.max(0, potShort(pot) - total)) });
  $("#fillConfirm").disabled = total <= 0;
}
$("#fillList").addEventListener("input", updateFillTotal);
$("#fillList").addEventListener("change", updateFillTotal);
$("#fillForm").onsubmit = event => {
  event.preventDefault();
  const pot = data.pots.find(p => p.id === fillingPotId), choices = fillChoices(); if (!pot || !choices.length) return;
  pushUndo(); const moved = choices.reduce((sum, c) => sum + movePotMoney(c.donor, pot, c.amount), 0);
  save(); render(); closeModals(); fillingPotId = null;
  toast(tr("Moved {m} to {n}.", { m: money(moved), n: pot.name }), "success", { undo: true });
};

/* ---------- Create and edit ---------- */
let editingPotId = null;
function openPotForm(pot) {
  editingPotId = pot ? pot.id : null;
  $("#potForm").reset();
  $("#potModalTitle").textContent = tr(pot ? "Edit savings pot" : "New savings pot");
  $("#potSubmit").textContent = tr(pot ? "Save pot" : "Create pot");
  if (pot) { $("#potName").value = pot.name; $("#potTarget").value = pot.target; $("#potColor").value = pot.color; $("#potDue").value = pot.due || ""; $("#potLocked").checked = pot.locked; }
  openModal("#potModal");
}
$("#addPotBtn").onclick = () => openPotForm(null);
$("#potForm").onsubmit = event => {
  event.preventDefault();
  const target = number($("#potTarget").value), name = $("#potName").value.trim().slice(0, 80), due = $("#potDue").value || null;
  if (!(target > 0) || !name) return toast("Enter a valid pot name and target.");
  pushUndo();
  const fields = { name, target, color: $("#potColor").value, due, locked: $("#potLocked").checked };
  const existing = data.pots.find(p => p.id === editingPotId);
  if (existing) Object.assign(existing, fields); else data.pots.push({ id: `pot-${Date.now()}`, saved: 0, ...fields });
  save(); render(); closeModals(); editingPotId = null;
  toast(existing ? "Pot saved." : "Savings pot created.", "success", { undo: true });
};

document.addEventListener("click", event => {
  const fill = event.target.closest(".fill-pot");
  if (fill) { const pot = data.pots.find(p => String(p.id) === fill.dataset.id); if (pot) openFill(pot); return; }
  const edit = event.target.closest(".edit-pot");
  if (edit) { const pot = data.pots.find(p => String(p.id) === edit.dataset.id); if (pot) openPotForm(pot); return; }
  const move = event.target.closest(".pot-move");
  if (move) {
    const index = data.pots.findIndex(p => String(p.id) === move.dataset.id), next = index + Number(move.dataset.dir);
    if (index < 0 || next < 0 || next >= data.pots.length) return;
    pushUndo(); [data.pots[index], data.pots[next]] = [data.pots[next], data.pots[index]];
    save(); render(); toast("Order saved.", "success", { undo: true });
    $$(".pot-move").find(b => b.dataset.id === move.dataset.id && b.dataset.dir === move.dataset.dir && !b.disabled)?.focus(); // keep focus on the pot that moved
  }
});
