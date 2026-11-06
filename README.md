# Pennywise

Pennywise is a private, local-first personal finance tracker.

## Pages

- `index.html` - public landing page for GitHub Pages
- `app.html` - local finance dashboard

Financial data is stored in the browser's IndexedDB. The password is hashed locally (PBKDF2) and works as a lock screen. It does not encrypt the stored data, and there is no password recovery. The app does not connect to a bank or send financial data to a server.

Your data is stored only on this device. Use Settings > Export backup (JSON) regularly; CSV and the printable report are for reading, not restoring.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files in this folder to the repository.
3. In **Settings > Pages**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder.
5. Open the generated Pages URL. The landing page will be at the root, and the app will be available at `/app.html`.

When a custom domain is purchased, add it in **Settings > Pages > Custom domain** and follow GitHub's DNS instructions.

## Install as an app

Open `app.html` over HTTPS (GitHub Pages) in Chrome, Edge or Safari and choose **Install** / **Add to Home Screen**. The app then works offline.

## Reports

The Reports page builds a detailed financial report for the selected month, week, last 3/6/12 months, year to date, or a custom range: executive summary, KPIs compared with the previous period, income vs spending chart, category and income-source tables, largest expenses, budget performance, financial-health indicators, savings and goals, and written insights. Use **Print / save PDF** for a formatted A4 document or **CSV** for the raw tables.

## Features

- **Languages:** English, Français and العربية (full right-to-left layout), switchable from the top bar on every screen, including the landing page. Dates, numbers and the printable report follow the chosen language.
- **Custom categories:** add, rename, recolour, change icons, or delete categories (Settings > Categories). Renaming updates your transactions; deleting moves them to "Other".
- **Undo:** every change (add, edit, delete, import, reset, category and recurring changes) shows an **Undo** button for 8 seconds. `Ctrl/Cmd + Z` also works.
- **Multiple accounts:** keep cash, bank accounts and cards separately (Settings > Accounts, or Overview > Accounts). Each has an opening balance, transactions and CSV imports go to the account you choose, and transfers between accounts never change your total balance. Deleting an account moves its contents to another one.
- **Upcoming bills and reminders:** a compact Overview card and an Upcoming screen (Transactions > Upcoming) list what is due by date: bills, subscriptions, salary and any future-dated transaction, for the next 7 to 90 days. Choose how many days ahead (1 to 14) items are highlighted as due soon, and see your recurring and subscription costs per month. Items are recorded automatically on their due date. Reminders appear inside the app; there are no push notifications.
- **Recurring manager:** pause, resume, end or delete subscriptions, salary and rent (Transactions > Recurring).
- **Bank CSV import:** choose your bank's CSV, match the columns, preview, and import. Handles `;` or `,` separators, `DD/MM/YYYY` dates, `1 234,56` amounts and separate debit/credit columns. Duplicates are skipped, and categories are guessed from the description.
- **Filters, tags and split:** filter by date, category and tag; split one receipt across several categories.
- **Safe to spend today:** set a monthly spending limit and the Overview shows how much you can spend per day.
- **Light and dark themes**, and a short **welcome guide** for new profiles.

Files: `app.html` + `app.js` (core), `features.js` (new features), `accounts.js` (accounts), `upcoming.js` (upcoming bills), `report.js` (reports), `i18n.js` and `i18n-landing.js` (translations), `styles.css`, `index.html` + `public.css` (landing page).

## Look and feel

- **Fonts are bundled** (`fonts/`: Inter and Noto Sans Arabic), so the app looks the same on every device and never contacts an outside server.
- `styles.css` is the base stylesheet (deduplicated); `design.css` is the visual layer on top (cards, charts, colour accents, motion, mobile bottom navigation).
- The landing page uses real screenshots in `screens/` (English, Français, العربية). To regenerate them after UI changes, open the app with demo data and take new 1400px-wide WebP captures named `overview-xx.webp`, `savings-xx.webp`, `reports-xx.webp`.

## Development

The app has no build step. To run the automated tests (logic, translations, accessibility):

```bash
npm install
npm test
``` 

`node_modules/` is git-ignored and is never published. A GitHub Actions workflow (`.github/workflows/test.yml`) runs the tests on every push.
