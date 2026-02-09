# Expense Tracker (Local-Only)

A local-first expense tracker inspired by the annual spreadsheet template. Data is stored on-device using IndexedDB and can be backed up to Google Sheets.

## Features
- Monthly income and expense tracking
- Categories aligned with the template
- Yearly summary (income, expenses, balance, category totals)
- Local-only storage via IndexedDB
- Optional Google Sheets backup

## Setup
1. Start the local static server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:3000`.

## Google Sheets Backup (Real OAuth)
1. Create a Google Cloud project and enable the **Google Sheets API**.
2. Create OAuth credentials for a **Web application**.
3. Add `http://localhost:3000` as an authorized JavaScript origin.
4. Paste the OAuth Client ID into the app.
5. Create a spreadsheet with two tabs: `Expenses` and `Income` (or set custom names in the UI).
6. Copy the spreadsheet ID from the sheet URL and paste it into the app.
7. Click **Connect Google**, then **Backup Now**.

## Data Storage
Data is persisted in IndexedDB in the browser.
