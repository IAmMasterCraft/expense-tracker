# Feature: Expense Tracker Web App (Local-Only)

## Requirements (EARS Format)
1. While a user selects a month, when the month changes, the system shall load that month's income and expenses from IndexedDB.
2. While viewing a month, when the user adds an expense with name, amount, category, and completed status, the system shall validate the input and persist the expense locally.
3. While viewing a month, when the user updates or deletes an expense, the system shall persist the change locally and refresh totals.
4. While viewing a month, when the user edits income, the system shall validate and persist the income locally.
5. While data exists, when the user views the year analysis, the system shall show category totals and counts, yearly income, total expenses, and balance.
6. While a user opts to back up, when they connect Google and submit a backup, the system shall write expenses and incomes to their Google Sheet.
7. While a user opts to restore, when they restore from Sheets, the system shall merge with local data using last-write-wins.
8. While a user imports CSV, when the file matches the template, the system shall merge it into local data.
9. While a user exports CSV, when they request export, the system shall generate a template-compatible file.
10. While offline or unauthenticated, when auto-backup is enabled, the system shall queue changes until it can sync.

## Architecture
- Frontend: Static UI in `public/` (HTML/CSS/JS), month selector, income form, expense table, year analysis table, IndexedDB storage, CSV import/export, Google Sheets OAuth integration.
- Backend: Static file server only (no data persistence).
- Security: Client-side validation, output encoding via `textContent`, limited CSP, OAuth scopes restricted to Sheets, no server-side data retention.

## Implementation Plan
- [ ] Add CSV templates and import/export UI
- [ ] Implement CSV parsing and export generation
- [ ] Implement Google Sheets restore with last-write-wins merge
- [ ] Add offline-first auto-backup queue
- [ ] Update documentation and run manual checks
