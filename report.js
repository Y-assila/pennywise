/* Pennywise — detailed financial reports (on-screen + printable PDF) */

const REPORT_PERIOD_LABELS = { month: "Selected month", week: "Current week", quarter: "Last 3 months", half: "Last 6 months", ytd: "Year to date", year: "Last 12 months", custom: "Custom range" };
const noon = (y, m, d) => new Date(y, m, d, 12);
const lastOfMonth = (y, m) => noon(y, m + 1, 0);
const fmtShort = date => date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysBetween = (a, b) => Math.round((b - a) / 86400000) + 1;
const sumBy = (list, key) => { const map = {}; list.forEach(t => { const k = key(t); map[k] = (map[k] || 0) + t.amount; }); return map; };
const pctText = (value, digits = 0) => value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
const compactNumber = value => { const a = Math.abs(value); const s = a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1000 ? (a / 1000).toFixed(a >= 1e4 ? 0 : 1) + "k" : String(Math.round(a)); return (value < 0 ? "−" : "") + s; };

function reportRange(period) {
  const vy = viewDate.getFullYear(), vm = viewDate.getMonth();
  const todayN = noon(today.getFullYear(), today.getMonth(), today.getDate());
  const monthsSpan = { quarter: 3, half: 6, year: 12 }[period];
  let start, end, prevStart, prevEnd;
  if (period === "week") {
    const ws = startOfWeek(anchorDate()); start = noon(ws.getFullYear(), ws.getMonth(), ws.getDate());
    end = new Date(start.getTime() + 6 * 86400000); prevStart = new Date(start.getTime() - 7 * 86400000); prevEnd = new Date(start.getTime() - 86400000);
  } else if (monthsSpan) {
    start = noon(vy, vm - monthsSpan + 1, 1); end = lastOfMonth(vy, vm); prevStart = noon(vy, vm - 2 * monthsSpan + 1, 1); prevEnd = lastOfMonth(vy, vm - monthsSpan);
  } else if (period === "ytd") {
    start = noon(vy, 0, 1); end = lastOfMonth(vy, vm); prevStart = noon(vy - 1, 0, 1); prevEnd = lastOfMonth(vy - 1, vm);
  } else if (period === "custom") {
    const from = $("#reportFrom").value, to = $("#reportTo").value;
    if (!(from && to && from <= to)) return reportRange("month");
    start = dateAtNoon(from); end = dateAtNoon(to); const length = daysBetween(start, end);
    prevEnd = new Date(start.getTime() - 86400000); prevStart = new Date(prevEnd.getTime() - (length - 1) * 86400000);
  } else {
    start = noon(vy, vm, 1); end = lastOfMonth(vy, vm); prevStart = noon(vy, vm - 1, 1); prevEnd = lastOfMonth(vy, vm - 1);
  }
  const elapsedEnd = end > todayN ? todayN : end;
  const days = daysBetween(start, end);
  return { period, start, end, prevStart, prevEnd, days, elapsedDays: Math.max(1, daysBetween(start, elapsedEnd)), months: Math.max(1, Math.round(days / 30.44)),
    label: period === "month" ? viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : `${fmtShort(start)} – ${fmtShort(end)}`,
    prevLabel: `${fmtShort(prevStart)} – ${fmtShort(prevEnd)}` };
}

function reportBuckets(r, list) {
  const mode = r.days > 62 ? "month" : r.days > 14 ? "week" : "day";
  const buckets = []; const index = {};
  const add = (key, label) => { index[key] = buckets.length; buckets.push({ key, label, income: 0, expense: 0 }); };
  if (mode === "month") { for (let d = noon(r.start.getFullYear(), r.start.getMonth(), 1); d <= r.end; d = noon(d.getFullYear(), d.getMonth() + 1, 1)) add(dateKey(d).slice(0, 7), d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })); }
  else if (mode === "week") { for (let d = startOfWeek(r.start); d <= r.end; d = new Date(d.getTime() + 7 * 86400000)) { const k = dateKey(d); add(k, d.toLocaleDateString("en-US", { month: "short", day: "numeric" })); } }
  else { for (let d = new Date(r.start); d <= r.end; d = new Date(d.getTime() + 86400000)) add(dateKey(d), d.toLocaleDateString("en-US", { day: "numeric", month: "short" })); }
  list.forEach(t => { const key = mode === "month" ? t.date.slice(0, 7) : mode === "week" ? dateKey(startOfWeek(dateAtNoon(t.date))) : t.date; const i = index[key]; if (i !== undefined) buckets[i][t.type] += t.amount; });
  return { mode, buckets };
}

function delta(current, previous, upIsGood) {
  if (!previous) return { text: "No prior data", cls: "flat" };
  const change = (current - previous) / Math.abs(previous);
  if (Math.abs(change) < 0.005) return { text: "● No change", cls: "flat" };
  return { text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(0)}% vs previous`, cls: (change > 0) === upIsGood ? "good" : "bad" };
}

function buildReport(period) {
  const r = reportRange(period);
  const s = dateKey(r.start), e = dateKey(r.end), ps = dateKey(r.prevStart), pe = dateKey(r.prevEnd);
  const cur = data.transactions.filter(t => t.date >= s && t.date <= e);
  const prev = data.transactions.filter(t => t.date >= ps && t.date <= pe);
  const tot = totals(cur), ptot = totals(prev);
  const net = tot.income - tot.expense, pnet = ptot.income - ptot.expense;
  const rate = tot.income ? net / tot.income : null, prate = ptot.income ? pnet / ptot.income : null;
  const exp = cur.filter(t => t.type === "expense"), inc = cur.filter(t => t.type === "income");
  const pexp = prev.filter(t => t.type === "expense"), pinc = prev.filter(t => t.type === "income");
  const ec = sumBy(exp, t => t.category), pec = sumBy(pexp, t => t.category);
  const categories = Object.entries(ec).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, prev: pec[name] || 0, share: tot.expense ? amount / tot.expense : 0 }));
  const ic = sumBy(inc, t => t.category), pic = sumBy(pinc, t => t.category);
  const sources = Object.entries(ic).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, prev: pic[name] || 0, share: tot.income ? amount / tot.income : 0 }));
  const topExpenses = [...exp].sort((a, b) => b.amount - a.amount).slice(0, 10);
  const payments = Object.entries(sumBy(exp, t => t.payment || "Other")).sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount, share: tot.expense ? amount / tot.expense : 0 }));
  const fixed = exp.filter(t => t.frequency !== "One-time").reduce((sum, t) => sum + t.amount, 0);
  const movedToSavings = data.transfers.filter(t => t.date >= s && t.date <= e).reduce((sum, t) => sum + t.amount, 0);
  const budgets = r.days >= 28 ? data.budgets.map(b => ({ category: b.category, limit: b.amount * r.months, spent: ec[b.category] || 0 })) : [];
  const potsSaved = data.pots.reduce((sum, p) => sum + p.saved, 0), goalsSaved = data.goals.reduce((sum, g) => sum + g.saved, 0);
  const avgMonthlyExpense = emergencyRecommendation() / 3;
  const runway = avgMonthlyExpense ? potsSaved / avgMonthlyExpense : null;
  const topShare = categories[0]?.share ?? null;
  const fixedShare = tot.income ? fixed / tot.income : null;
  const spendRatio = tot.income ? tot.expense / tot.income : null;
  const withinBudget = budgets.length ? budgets.filter(b => b.spent <= b.limit).length / budgets.length : null;
  const rank = (value, good, watch, higherIsBetter) => value === null ? "na" : (higherIsBetter ? (value >= good ? "good" : value >= watch ? "watch" : "risk") : (value <= good ? "good" : value <= watch ? "watch" : "risk"));
  const health = [
    { label: "Savings rate", value: pctText(rate), status: rank(rate, 0.2, 0.1, true), note: "Target: keep at least 20% of income." },
    { label: "Spending vs income", value: pctText(spendRatio), status: rank(spendRatio, 0.8, 1, false), note: "Below 80% leaves room to save." },
    { label: "Fixed commitments", value: pctText(fixedShare), status: rank(fixedShare, 0.5, 0.7, false), note: "Recurring costs as a share of income." },
    { label: "Emergency runway", value: runway === null ? "—" : `${runway.toFixed(1)} months`, status: rank(runway, 3, 1, true), note: "Savings pots ÷ average monthly spending." },
    { label: "Largest category", value: pctText(topShare), status: rank(topShare, 0.35, 0.5, false), note: categories[0] ? `${categories[0].name} — avoid over-reliance on one cost.` : "No spending recorded." },
    { label: "Budgets respected", value: pctText(withinBudget), status: rank(withinBudget, 0.8, 0.5, true), note: budgets.length ? "Share of budgets kept within limit." : "Set budgets in Savings to track this." }
  ];
  const insights = [];
  if (!cur.length) insights.push("No transactions were recorded in this period, so there is nothing to analyse yet.");
  else {
    if (!tot.income) insights.push("No income was recorded. Add your income so savings rate and ratios can be measured.");
    else if (net < 0) insights.push(`Spending exceeded income by ${money(-net)}. Review the largest categories first.`);
    else insights.push(`You kept ${money(net)} (${pctText(rate)} of income). ${rate >= 0.2 ? "That meets the 20% savings target." : "Aim for 20% by trimming your largest variable category."}`);
    if (categories[0]) insights.push(`${categories[0].name} is your largest cost at ${money(categories[0].amount)} (${pctText(categories[0].share)} of spending). A 10% reduction would free ${money(categories[0].amount * 0.1)}.`);
    const movers = categories.filter(c => c.prev > 0).map(c => ({ ...c, change: (c.amount - c.prev) / c.prev })).sort((a, b) => b.change - a.change);
    if (movers[0] && movers[0].change > 0.2) insights.push(`${movers[0].name} rose ${pctText(movers[0].change)} versus the previous period (+${money(movers[0].amount - movers[0].prev)}).`);
    const drop = movers[movers.length - 1]; if (drop && drop.change < -0.2) insights.push(`Good progress: ${drop.name} fell ${pctText(-drop.change)} versus the previous period.`);
    if (topExpenses[0]) insights.push(`Your largest single expense was ${money(topExpenses[0].amount)} on ${topExpenses[0].category} (${fmtShort(dateAtNoon(topExpenses[0].date))}).`);
    const over = budgets.filter(b => b.spent > b.limit).sort((a, b) => (b.spent - b.limit) - (a.spent - a.limit));
    if (over[0]) insights.push(`${over[0].category} is ${money(over[0].spent - over[0].limit)} over its budget. Pause or reduce this category.`);
    if (fixedShare !== null && fixedShare > 0.5) insights.push(`Recurring commitments take ${pctText(fixedShare)} of income, which limits flexibility. Review subscriptions and contracts.`);
    if (runway !== null && runway < 3) insights.push(`Your emergency fund covers ${runway.toFixed(1)} months of spending. Build towards 3–6 months.`);
    if (prate !== null && rate !== null && rate > prate + 0.02) insights.push(`Your savings rate improved from ${pctText(prate)} to ${pctText(rate)}.`);
  }
  const summary = !cur.length ? "No activity was recorded in this period."
    : `Between ${fmtShort(r.start)} and ${fmtShort(r.end)} you earned ${money(tot.income)} and spent ${money(tot.expense)}, leaving a net result of ${money(net)}${rate !== null ? ` (a savings rate of ${pctText(rate)})` : ""}. ${ptot.expense ? (tot.expense > ptot.expense ? `Spending is ${pctText((tot.expense - ptot.expense) / ptot.expense)} higher than the previous period.` : `Spending is ${pctText((ptot.expense - tot.expense) / ptot.expense)} lower than the previous period.`) : "There is no earlier period to compare with yet."}${categories[0] ? ` Your biggest category was ${categories[0].name} (${pctText(categories[0].share)} of spending).` : ""}`;
  return { r, tot, ptot, net, pnet, rate, prate, avgDaily: tot.expense / r.elapsedDays, pAvgDaily: ptot.expense / Math.max(1, daysBetween(r.prevStart, r.prevEnd)), categories, sources, topExpenses, payments, fixed, movedToSavings, budgets, health, insights, summary,
    trend: reportBuckets(r, cur), count: cur.length, snapshot: { balance: allBalance(), potsSaved, goalsSaved, goals: data.goals.map(g => ({ ...g, status: goalStatus(g).status })) } };
}

function trendSVG(trend) {
  const { buckets } = trend; if (!buckets.length) return "";
  const W = 720, H = 250, L = 46, R = 10, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
  const maxV = Math.max(1, ...buckets.flatMap(b => [b.income, b.expense])), minV = Math.min(0, ...buckets.map(b => b.income - b.expense));
  const y = v => T + (maxV - v) / (maxV - minV) * ph, gw = pw / buckets.length, bw = Math.min(28, gw * 0.32);
  let out = `<svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income, spending and net result over time" preserveAspectRatio="xMidYMid meet">`;
  for (let i = 0; i <= 4; i += 1) { const v = minV + (maxV - minV) * i / 4; out += `<line class="g" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${compactNumber(v)}</text>`; }
  const step = buckets.length > 12 ? 2 : 1; const pts = [];
  buckets.forEach((b, i) => {
    const cx = L + gw * (i + 0.5), net = b.income - b.expense;
    out += `<rect class="inc" x="${(cx - bw - 1).toFixed(1)}" y="${y(Math.max(b.income, 0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(b.income)).toFixed(1)}" rx="2"/><rect class="exp" x="${(cx + 1).toFixed(1)}" y="${y(Math.max(b.expense, 0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - y(b.expense)).toFixed(1)}" rx="2"/>`;
    pts.push(`${cx.toFixed(1)},${y(net).toFixed(1)}`);
    if (i % step === 0) out += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${h(b.label)}</text>`;
  });
  out += `<polyline class="net" points="${pts.join(" ")}"/>${pts.map(p => `<circle class="nd" cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3"/>`).join("")}</svg>`;
  return out;
}

function reportHTML(rep) {
  const { r, tot, ptot, net, pnet, rate, prate } = rep;
  const dl = d => `<span class="rp-delta ${d.cls}">${h(d.text)}</span>`;
  const kpi = (label, value, d, sub) => `<div class="rp-kpi"><small>${label}</small><strong>${h(value)}</strong>${d ? dl(d) : ""}${sub ? `<span>${h(sub)}</span>` : ""}</div>`;
  const rateDelta = prate === null || rate === null ? { text: "No prior data", cls: "flat" } : { text: `${rate >= prate ? "▲" : "▼"} ${Math.abs((rate - prate) * 100).toFixed(1)} pts vs previous`, cls: rate >= prate ? "good" : "bad" };
  const chg = (c, p, upIsGood) => { if (!p) return `<span class="rp-delta flat">—</span>`; const d = delta(c, p, upIsGood); return `<span class="rp-delta ${d.cls}">${h(d.text.replace(" vs previous", ""))}</span>`; };
  const bar = (share, color) => `<div class="rp-bar"><i style="width:${Math.min(100, Math.round(share * 100))}%;${color ? `background:${color}` : ""}"></i></div>`;
  const table = (head, rows, foot) => `<div class="rp-table-wrap"><table class="rp-table"><thead><tr>${head.map((x, i) => `<th${x.num ? ' class="num"' : ""}>${x.t}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ""}</table></div>`;
  const empty = text => `<p class="rp-foot">${h(text)}</p>`;
  const statusLabel = { good: "Healthy", watch: "Watch", risk: "Action", na: "No data" };
  let html = `<div class="rp">`;
  html += `<div class="rp-card rp-summary"><h2>Executive summary</h2><p>${h(rep.summary)}</p></div>`;
  html += `<div class="rp-kpis">${kpi("Income", money(tot.income), delta(tot.income, ptot.income, true))}${kpi("Expenses", money(tot.expense), delta(tot.expense, ptot.expense, false))}${kpi("Net result", money(net), delta(net, pnet, true))}${kpi("Savings rate", pctText(rate, 1), rateDelta)}${kpi("Avg daily spend", money(rep.avgDaily), delta(rep.avgDaily, rep.pAvgDaily, false))}${kpi("Moved to savings", money(rep.movedToSavings), null, `${rep.count} transaction${rep.count === 1 ? "" : "s"}`)}</div>`;
  html += `<div class="rp-card"><h3>Income vs spending</h3><div class="rp-legend"><span><i class="rp-dot" style="background:var(--rp-teal)"></i>Income</span><span><i class="rp-dot" style="background:var(--rp-coral)"></i>Spending</span><span><i class="rp-dot" style="background:var(--rp-yellow)"></i>Net result</span></div>${rep.count ? trendSVG(rep.trend) : empty("No data to chart yet.")}</div>`;
  html += `<div class="rp-card"><h3>Spending by category</h3>${rep.categories.length ? table([{ t: "Category" }, { t: "Amount", num: 1 }, { t: "Share" }, { t: "Previous", num: 1 }, { t: "Change", num: 1 }], rep.categories.map(c => `<tr><td><i class="rp-dot" style="background:${categoryColors[c.name] || "#b7c4bd"}"></i>${h(c.name)}</td><td class="num">${h(money(c.amount))}</td><td style="min-width:110px">${bar(c.share, categoryColors[c.name])}<small class="rp-foot">${pctText(c.share, 1)}</small></td><td class="num">${h(money(c.prev))}</td><td class="num">${chg(c.amount, c.prev, false)}</td></tr>`), `<tr><td>Total</td><td class="num">${h(money(tot.expense))}</td><td></td><td class="num">${h(money(ptot.expense))}</td><td class="num">${chg(tot.expense, ptot.expense, false)}</td></tr>`) : empty("No spending recorded in this period.")}</div>`;
  html += `<div class="rp-two"><div class="rp-card"><h3>Income sources</h3>${rep.sources.length ? table([{ t: "Source" }, { t: "Amount", num: 1 }, { t: "Share", num: 1 }, { t: "Change", num: 1 }], rep.sources.map(x => `<tr><td>${h(x.name)}</td><td class="num">${h(money(x.amount))}</td><td class="num">${pctText(x.share, 1)}</td><td class="num">${chg(x.amount, x.prev, true)}</td></tr>`)) : empty("No income recorded in this period.")}</div>
    <div class="rp-card"><h3>Payment methods</h3>${rep.payments.length ? table([{ t: "Method" }, { t: "Spent", num: 1 }, { t: "Share", num: 1 }], rep.payments.map(x => `<tr><td>${h(x.name)}</td><td class="num">${h(money(x.amount))}</td><td class="num">${pctText(x.share, 1)}</td></tr>`)) : empty("No spending recorded.")}<p class="rp-foot">Fixed (recurring) spending: ${h(money(rep.fixed))} · Variable: ${h(money(tot.expense - rep.fixed))}</p></div></div>`;
  html += `<div class="rp-card"><h3>Ten largest expenses</h3>${rep.topExpenses.length ? table([{ t: "Date" }, { t: "Category" }, { t: "Notes" }, { t: "Method" }, { t: "Amount", num: 1 }], rep.topExpenses.map(t => `<tr><td>${h(fmtShort(dateAtNoon(t.date)))}</td><td>${h(t.category)}</td><td>${h(t.notes || "—")}</td><td>${h(t.payment)}</td><td class="num">${h(money(t.amount))}</td></tr>`)) : empty("No expenses recorded in this period.")}</div>`;
  if (rep.budgets.length) html += `<div class="rp-card"><h3>Budget performance</h3>${table([{ t: "Category" }, { t: "Budget", num: 1 }, { t: "Spent", num: 1 }, { t: "Remaining", num: 1 }, { t: "Used" }], rep.budgets.map(b => { const used = b.limit ? b.spent / b.limit : 0; return `<tr><td>${h(b.category)}</td><td class="num">${h(money(b.limit))}</td><td class="num">${h(money(b.spent))}</td><td class="num">${h(money(b.limit - b.spent))}</td><td style="min-width:130px">${bar(used, used > 1 ? "var(--rp-coral)" : "")}<span class="rp-chip ${used > 1 ? "risk" : used >= 0.8 ? "watch" : "good"}">${Math.round(used * 100)}% ${used > 1 ? "over" : "used"}</span></td></tr>`; }))}<p class="rp-foot">Monthly limits are scaled to the length of the period (${r.months} month${r.months === 1 ? "" : "s"}).</p></div>`;
  html += `<div class="rp-card"><h3>Financial health indicators</h3><div class="rp-health">${rep.health.map(x => `<div><span class="rp-chip ${x.status}">${statusLabel[x.status]}</span><strong>${h(x.label)}</strong><b>${h(x.value)}</b><small>${h(x.note)}</small></div>`).join("")}</div></div>`;
  const sn = rep.snapshot;
  html += `<div class="rp-card"><h3>Savings & goals snapshot</h3><div class="rp-kpis"><div class="rp-kpi"><small>Available balance</small><strong>${h(money(sn.balance))}</strong></div><div class="rp-kpi"><small>In savings pots</small><strong>${h(money(sn.potsSaved))}</strong></div><div class="rp-kpi"><small>In goals</small><strong>${h(money(sn.goalsSaved))}</strong></div></div>${sn.goals.length ? table([{ t: "Goal" }, { t: "Saved", num: 1 }, { t: "Target", num: 1 }, { t: "Progress" }, { t: "Deadline" }, { t: "Status" }], sn.goals.map(g => `<tr><td>${h(g.name)}</td><td class="num">${h(money(g.saved))}</td><td class="num">${h(money(g.target))}</td><td style="min-width:100px">${bar(g.saved / g.target)}</td><td>${h(fmtShort(dateAtNoon(g.deadline)))}</td><td><span class="rp-chip ${g.status === "Catch up" || g.status === "Past due" ? "watch" : "good"}">${h(g.status)}</span></td></tr>`)) : empty("No goals created yet.")}</div>`;
  html += `<div class="rp-card"><h3>Insights & recommendations</h3><ol class="rp-insights">${rep.insights.map(i => `<li>${h(i)}</li>`).join("")}</ol></div>`;
  html += `<p class="rp-foot">Compared with ${h(r.prevLabel)}. Figures come from the transactions recorded in Pennywise and are for personal information only, not financial advice.</p></div>`;
  return html;
}

const REPORT_CSS = `
.rp{color:var(--rp-ink);font-size:13px;line-height:1.5}
.rp h2{font-size:18px;margin:0 0 6px}.rp h3{font-size:14px;margin:0 0 12px}
.rp-card{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:12px;padding:18px;margin-bottom:16px;break-inside:avoid;min-width:0}
.rp-summary{border-left:4px solid var(--rp-teal)}.rp-summary p{margin:6px 0 0}
.rp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.rp-card .rp-kpis{margin-bottom:12px}
.rp-kpi{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:12px;padding:14px;break-inside:avoid;min-width:0}
.rp-kpi small{display:block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--rp-muted);font-weight:700}
.rp-kpi strong{display:block;font-size:18px;margin:6px 0 2px;white-space:nowrap}
.rp-kpi>span{display:block;font-size:11px;color:var(--rp-muted)}
.rp-delta{font-size:11px;font-weight:600}.rp-delta.good{color:var(--rp-good)}.rp-delta.bad{color:var(--rp-bad)}.rp-delta.flat{color:var(--rp-muted)}
.rp-table-wrap{overflow-x:auto}
.rp-table{width:100%;border-collapse:collapse;font-size:12px}
.rp-table th{text-align:left;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--rp-muted);padding:8px;border-bottom:1px solid var(--rp-line)}
.rp-table td{padding:8px;border-bottom:1px solid var(--rp-line);vertical-align:middle}
.rp-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.rp-table tfoot td{font-weight:700;border-top:2px solid var(--rp-line);border-bottom:0}
.rp-bar{height:6px;border-radius:6px;background:var(--rp-soft);overflow:hidden;margin-bottom:3px}.rp-bar i{display:block;height:100%;background:var(--rp-teal)}
.rp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}
.rp-chip{display:inline-block;padding:2px 9px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border:1px solid currentColor}
.rp-chip.good{color:var(--rp-good)}.rp-chip.watch{color:var(--rp-warn)}.rp-chip.risk{color:var(--rp-bad)}.rp-chip.na{color:var(--rp-muted)}
.rp-health{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.rp-health>div{border:1px solid var(--rp-line);border-radius:10px;padding:12px;break-inside:avoid}
.rp-health strong{display:block;margin:8px 0 0;font-size:12px}.rp-health b{display:block;font-size:20px;margin:2px 0}.rp-health small{color:var(--rp-muted);font-size:11px}
.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rp-two .rp-table{font-size:11px}.rp-two .rp-table th,.rp-two .rp-table td{padding:8px 4px}.rp-two .rp-table th{letter-spacing:.4px}
.rp-chart{width:100%;height:auto;display:block}.rp-chart text{fill:var(--rp-muted);font-size:10px}.rp-chart .g{stroke:var(--rp-line)}
.rp-chart .inc{fill:var(--rp-teal)}.rp-chart .exp{fill:var(--rp-coral)}.rp-chart .net{stroke:var(--rp-yellow);fill:none;stroke-width:2}.rp-chart .nd{fill:var(--rp-yellow)}
.rp-legend{display:flex;gap:16px;font-size:11px;color:var(--rp-muted);margin-bottom:6px;flex-wrap:wrap}
.rp-insights{margin:0;padding-left:20px}.rp-insights li{margin-bottom:8px}
.rp-foot{font-size:11px;color:var(--rp-muted);margin:6px 0 0;display:block}
@media(max-width:760px){.rp-two{grid-template-columns:1fr}}`;
const REPORT_SCREEN_VARS = `#reportBody .rp{--rp-ink:var(--ink);--rp-muted:var(--muted);--rp-line:var(--line);--rp-card:var(--surface);--rp-soft:#22343a;--rp-teal:var(--teal);--rp-coral:var(--coral);--rp-yellow:var(--yellow);--rp-good:#4fd1a5;--rp-bad:#ff8a73;--rp-warn:#efba52}
.report-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline;margin:4px 0 14px;color:var(--muted);font-size:13px}.report-head strong{color:var(--ink);font-size:15px}
.report-custom{display:flex;gap:8px}.report-custom input{padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}`;
const reportStyle = document.createElement("style"); reportStyle.textContent = REPORT_CSS + REPORT_SCREEN_VARS; document.head.appendChild(reportStyle);

function renderReports() {
  const period = $("#reportPeriod")?.value || "month"; const rep = buildReport(period);
  $("#reportBody").innerHTML = `<div class="report-head"><div><strong>${h(REPORT_PERIOD_LABELS[period])} · ${h(rep.r.label)}</strong></div><div>Compared with ${h(rep.r.prevLabel)}</div></div>` + reportHTML(rep);
}

function printableReportHTML(autoPrint) {
  const rep = buildReport($("#reportPeriod").value);
  const who = data.settings.name || "Pennywise profile";
  const css = `@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;padding:0 4px;font-family:-apple-system,"Segoe UI",Inter,system-ui,sans-serif;color:#17211f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp{--rp-ink:#17211f;--rp-muted:#66746e;--rp-line:#dfe5e1;--rp-card:#fff;--rp-soft:#eef2ef;--rp-teal:#167d72;--rp-coral:#e0604a;--rp-yellow:#d9a02f;--rp-good:#12805f;--rp-bad:#c0432d;--rp-warn:#a97a14}
.doc-head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #167d72;padding-bottom:12px;margin-bottom:18px}.doc-head h1{margin:0;font-size:24px;color:#167d72}.doc-head p{margin:2px 0 0;color:#66746e;font-size:12px}.doc-meta{text-align:right;font-size:12px;color:#66746e}.doc-meta strong{display:block;color:#17211f;font-size:15px}${REPORT_CSS}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pennywise report — ${h(rep.r.label)}</title><style>${css}</style></head><body><div class="doc-head"><div><h1>Pennywise</h1><p>Financial report · ${h(who)} · Currency: ${h(data.settings.currency)}</p></div><div class="doc-meta"><strong>${h(REPORT_PERIOD_LABELS[$("#reportPeriod").value])}</strong>${h(rep.r.label)}<br>Generated ${h(fmtShort(today))}</div></div>${reportHTML(rep)}${autoPrint ? "<script>onload=()=>setTimeout(()=>print(),400)<\/script>" : ""}</body></html>`;
}

function printReport() {
  const html = printableReportHTML(true); const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); toast("Report opened — choose “Save as PDF” in the print dialog."); return; }
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([printableReportHTML(false)], { type: "text/html" })); link.download = `pennywise-report-${dateKey(today)}.html`; link.click(); URL.revokeObjectURL(link.href); toast("Popup blocked — report downloaded instead. Open it and print to PDF.");
}

function exportReportCsv() {
  const rep = buildReport($("#reportPeriod").value); const { r, tot, ptot } = rep; const rows = [];
  const safe = value => { const text = String(value); return /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? "'" + text : text; };
  rows.push(["Pennywise financial report"], ["Period", r.label], ["Compared with", r.prevLabel], ["Currency", data.settings.currency], [], ["Summary", "Current", "Previous"], ["Income", tot.income, ptot.income], ["Expenses", tot.expense, ptot.expense], ["Net", rep.net, rep.pnet], ["Savings rate", rep.rate === null ? "" : pctText(rep.rate, 1), rep.prate === null ? "" : pctText(rep.prate, 1)], [], ["Spending by category", "Amount", "Share", "Previous"]);
  rep.categories.forEach(c => rows.push([c.name, c.amount, pctText(c.share, 1), c.prev]));
  rows.push([], ["Income by source", "Amount", "Share", "Previous"]); rep.sources.forEach(c => rows.push([c.name, c.amount, pctText(c.share, 1), c.prev]));
  rows.push([], ["Payment method", "Spent", "Share"]); rep.payments.forEach(c => rows.push([c.name, c.amount, pctText(c.share, 1)]));
  rows.push([], ["Largest expenses", "Date", "Category", "Amount", "Notes"]); rep.topExpenses.forEach(t => rows.push(["", t.date, t.category, t.amount, t.notes]));
  rows.push([], ["Period", "Income", "Spending", "Net"]); rep.trend.buckets.forEach(b => rows.push([b.label, b.income, b.expense, b.income - b.expense]));
  const csv = rows.map(row => row.map(value => `"${safe(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `pennywise-report-${dateKey(today)}.csv`; link.click(); URL.revokeObjectURL(link.href); toast("Report CSV downloaded.");
}

$("#reportPeriod").onchange = () => { $("#reportCustom").hidden = $("#reportPeriod").value !== "custom"; renderReports(); };
$("#reportFrom").value = `${today.getFullYear()}-01-01`; $("#reportTo").value = dateKey(today);
$("#reportFrom").onchange = renderReports; $("#reportTo").onchange = renderReports;
$("#downloadPdfBtn").onclick = printReport; $("#exportReportCsvBtn").onclick = exportReportCsv;
