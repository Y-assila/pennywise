// Regenerates the README screenshots with demo data.
// Usage: serve the repo (python3 -m http.server 8765), then: node scripts/screenshots.js docs/screenshots-raw
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium). Convert the PNGs to WebP afterwards.
const { chromium } = require("playwright");
const out = process.argv[2];
const demo = () => {
  const d = (m, day) => { const t = new Date(); return dateKey(new Date(t.getFullYear(), t.getMonth() + m, day, 12)); };
  const tdy = new Date().getDate();
  const tx = []; let i = 0;
  const add = (type, amount, date, category, notes, extra = {}) => tx.push({ id: `demo-${i++}`, type, amount, date, category, notes, payment: "Card", frequency: "One-time", account: "main", ...extra });
  add("income", 14500, d(-3, 1), "Salary", "Monthly salary", { frequency: "Monthly", payment: "Bank transfer" });
  add("expense", 4200, d(-3, 3), "Rent", "Apartment rent", { frequency: "Monthly", payment: "Bank transfer" });
  add("expense", 129, d(-3, 8), "Subscriptions", "Music streaming", { frequency: "Monthly" });
  add("expense", 350, d(-3, 15), "Bills", "Internet & phone", { frequency: "Monthly" });
  const shops = [["Food", "Groceries", 420], ["Food", "Café with friends", 85], ["Transport", "Fuel", 300], ["Shopping", "New shoes", 640], ["Entertainment", "Cinema", 120], ["Health", "Pharmacy", 95], ["Food", "Restaurant", 260], ["Transport", "Taxi", 60]];
  for (let m = -3; m <= 0; m++) shops.forEach(([c, n, a], k) => { const day = 2 + k * 3 + (m + 3); if (m === 0 && day > tdy) return; add("expense", Math.round(a * (0.8 + ((k * 7 + m * 3) % 5) / 10)), d(m, day), c, n, { account: k % 3 === 0 ? "cash" : "main", payment: k % 3 === 0 ? "Cash" : "Card", tags: c === "Food" ? ["family"] : [] }); });
  add("income", 2400, d(-1, 20), "Freelance", "Logo design project");
  add("income", 3100, d(0, Math.max(1, tdy - 2)), "Freelance", "Website project");
  add("expense", 1800, d(0, Math.min(28, tdy + 4)), "Bills", "Car insurance");
  add("expense", 450, d(0, tdy + 9), "Health", "Dentist appointment");
  return {
    accounts: [{ id: "main", name: "Main account", kind: "bank", opening: 12000 }, { id: "cash", name: "Cash", kind: "cash", opening: 1500 }],
    transactions: tx, rule: { type: "percent", amount: 10 }, monthlyLimit: 9000, onboarded: true,
    goals: [{ id: "g1", name: "Summer trip", target: 8000, saved: 5200, deadline: d(4, 15), created: d(-4, 1) }, { id: "g2", name: "New laptop", target: 12000, saved: 3900, deadline: d(8, 1), created: d(-3, 1) }],
    pots: [{ id: "p1", name: "Emergency fund", target: 30000, saved: 14250, color: "teal" }, { id: "p2", name: "Gifts", target: 2000, saved: 1100, color: "coral" }],
    budgets: [{ category: "Food", amount: 1600 }, { category: "Shopping", amount: 800 }, { category: "Transport", amount: 700 }],
    settings: { name: "Sara", currency: "MAD", language: "en", lastBackup: new Date().toISOString(), reminderDays: 7 }
  };
};
(async () => {
  const browser = await chromium.launch();
  const shoot = async ({ name, lang = "en", theme = "light", view = "overview", mobile = false, before }) => {
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(l => { localStorage.setItem("pennywise-lang", l); }, lang);
    await page.goto("http://localhost:8765/app.html");
    await page.fill("#authName", "Sara"); await page.fill("#authPassword", "demo-password"); await page.fill("#authConfirm", "demo-password");
    await page.click("#authSubmit"); await page.waitForSelector("body.app-unlocked");
    await page.evaluate(src => { data = cleanData(new Function("return (" + src + ")()")()); data.settings.language = lang(); expandRecurringTransactions(); save(); render(); closeModals(); }, demo.toString());
    await page.waitForTimeout(300); await page.evaluate(() => closeModals());
    await page.evaluate(([v, t]) => { setTheme(t); document.querySelector(`.nav-item[data-view="${v}"]`).click(); window.scrollTo(0, 0); }, [view, theme]);
    if (before) await page.evaluate(before);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}.png` });
    if (errors.length) console.log(name, "ERRORS", errors);
    await ctx.close();
  };
  await shoot({ name: "overview" });
  await shoot({ name: "overview-dark", theme: "dark" });
  await shoot({ name: "transactions", view: "transactions" });
  await shoot({ name: "upcoming", before: "openUpcoming()" });
  await shoot({ name: "savings", view: "savings" });
  await shoot({ name: "goals", view: "goals" });
  await shoot({ name: "reports", view: "reports" });
  await shoot({ name: "arabic", lang: "ar" });
  await shoot({ name: "french", lang: "fr", view: "reports" });
  await shoot({ name: "mobile", mobile: true });
  await shoot({ name: "mobile-dark", mobile: true, theme: "dark", view: "transactions" });
  await browser.close();
})();
