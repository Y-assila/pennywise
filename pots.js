/* Pennywise — live savings pots.
   Pots are ranked: the first one is the most important. A pot can have a "needed by" date.
   When an important pot is due within the live window and still short of its target,
   less important pots give it money, starting with the least important. Protected pots never give. */

const liveWindowChoices = [0, 7, 14, 30, 60];
const liveWindow = () => liveWindowChoices.includes(data.settings.liveWindow) ? data.settings.liveWindow : 30;
const round2 = value => Math.round(value * 100) / 100;
const daysUntil = key => Math.round((dateAtNoon(key) - dateAtNoon(todayKey())) / 86400000);
const potShort = pot => round2(Math.max(0, pot.target - pot.saved));

// Due inside the live window, not yet past, and still missing money.
function potNeedsTopUp(pot) {
  const window = liveWindow();
  if (!window || !pot.due || potShort(pot) <= 0) return false;
  const days = daysUntil(pot.due);
  return days >= 0 && days <= window;
}

// Moves money from less important pots to important pots that are due soon. Returns the moves made.
function rebalancePots() {
  const moves = [];
  data.pots.forEach((pot, index) => {
    if (!potNeedsTopUp(pot)) return;
    for (let j = data.pots.length - 1; j > index && potShort(pot) > 0; j -= 1) {
      const donor = data.pots[j];
      if (donor.locked || donor.saved <= 0) continue;
      const amount = round2(Math.min(potShort(pot), donor.saved));
      if (amount <= 0) continue;
      donor.saved = round2(donor.saved - amount); pot.saved = round2(pot.saved + amount);
      const group = `live-${Date.now()}-${index}-${j}-${moves.length}`, date = todayKey();
      data.transfers.push({ id: `${group}-out`, amount: -amount, date, destination: `pot:${donor.id}`, automatic: true, group });
      data.transfers.push({ id: `${group}-in`, amount, date, destination: `pot:${pot.id}`, automatic: true, group });
      moves.push({ from: donor.id, to: pot.id, amount });
    }
  });
  return moves;
}

// Money this pot received from other pots in the last 7 days.
function recentTopUps(pot) {
  return data.transfers.filter(t => t.group && t.amount > 0 && t.destination === `pot:${pot.id}` && daysUntil(t.date) >= -7).reduce((sum, t) => sum + t.amount, 0);
}

function potCardMarkup(pot, index) {
  const pct = Math.min(100, Math.round(pot.saved / pot.target * 100));
  const color = pot.color === "coral" ? "var(--coral)" : pot.color === "purple" ? "var(--purple)" : pot.color === "yellow" ? "var(--yellow)" : "var(--teal)";
  const count = data.pots.length, short = potShort(pot), live = potNeedsTopUp(pot), received = recentTopUps(pot);
  let due = "";
  if (pot.due) {
    const days = daysUntil(pot.due), date = h(dateAtNoon(pot.due).toLocaleDateString(locale(), { month: "short", day: "numeric", year: "numeric" }));
    const state = days < 0 ? tr("Was due {d}", { d: date }) : short <= 0 ? tr("Ready · needed by {d}", { d: date }) : days === 0 ? tr("Needed today · {m} short", { m: money(short) }) : tr("Needed by {d} · {n} days left", { d: date, n: days });
    due = `<p class="pot-due${live ? " short" : short <= 0 && days >= 0 ? " ready" : ""}">${iconMarkup("bell")}<span>${h(state)}</span></p>`;
  }
  const notes = [
    live ? `<span class="pot-note short">${h(tr("Still {m} short. No less important pot has money left to give.", { m: money(short) }))}</span>` : "",
    received ? `<span class="pot-note received">${h(tr("Topped up {m} from less important pots", { m: money(received) }))}</span>` : ""
  ].join("");
  return `<div class="pot-card${pct >= 100 ? " full" : ""}${live ? " live-short" : ""}" style="--c:${color};--pct:${pct}">
    <div class="pot-head"><span class="pot-rank" title="${h(tr("Importance"))}">#${index + 1}</span><span class="pot-icon ${h(pot.color)}">${iconMarkup("savings")}</span>
      <span class="pot-order"><button type="button" class="icon-btn pot-move" data-dir="-1" data-id="${h(pot.id)}" aria-label="${h(tr("More important"))}" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="icon-btn pot-move" data-dir="1" data-id="${h(pot.id)}" aria-label="${h(tr("Less important"))}" ${index === count - 1 ? "disabled" : ""}>↓</button></span>
      <span class="mini-ring" style="--pct:${pct}"><b>${pct}%</b></span></div>
    <h3>${h(pot.name)}${pot.locked ? ` <span class="badge pot-lock">${h(tr("Protected"))}</span>` : ""}</h3>
    <div class="pot-amount">${money(pot.saved)} <span>${h(tr("of {m}", { m: money(pot.target) }))}</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    ${due}${notes}
    <div class="pot-footer"><span>${h(tr("Progress"))}</span><strong>${h(tr("{m} to go", { m: money(short) }))}</strong></div>
    <div class="pot-actions"><button class="text-btn transfer-btn" data-destination="pot:${h(pot.id)}">＋ ${h(tr("Move money"))}</button><button class="text-btn edit-pot" data-id="${h(pot.id)}">${h(tr("Edit"))}</button><button class="text-btn delete-pot" data-id="${h(pot.id)}">${h(tr("Delete"))}</button></div>
  </div>`;
}

function renderLiveControl() {
  const select = $("#liveWindow"); if (select) select.value = String(liveWindow());
}

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
  const moves = rebalancePots();
  save(); render(); closeModals(); editingPotId = null;
  toast(moves.length ? "Pot saved. Less important pots topped it up." : existing ? "Pot saved." : "Savings pot created.", "success", { undo: true });
};

document.addEventListener("click", event => {
  const edit = event.target.closest(".edit-pot");
  if (edit) { const pot = data.pots.find(p => String(p.id) === edit.dataset.id); if (pot) openPotForm(pot); return; }
  const move = event.target.closest(".pot-move");
  if (move) {
    const index = data.pots.findIndex(p => String(p.id) === move.dataset.id), next = index + Number(move.dataset.dir);
    if (index < 0 || next < 0 || next >= data.pots.length) return;
    pushUndo(); [data.pots[index], data.pots[next]] = [data.pots[next], data.pots[index]];
    const moves = rebalancePots(); save(); render();
    toast(moves.length ? "Order saved. Less important pots topped up the ones due soon." : "Order saved.", "success", { undo: true });
    $$(".pot-move").find(b => b.dataset.id === move.dataset.id && b.dataset.dir === move.dataset.dir && !b.disabled)?.focus(); // keep focus on the pot that moved
  }
});
$("#liveWindow").onchange = event => {
  const days = Number(event.target.value); if (!liveWindowChoices.includes(days)) return;
  pushUndo(); data.settings.liveWindow = days;
  const moves = rebalancePots(); save(); render();
  toast(!days ? "Live pots are off." : moves.length ? "Live pots are on. Pots due soon were topped up." : "Live pots are on.", "success", { undo: true });
};
