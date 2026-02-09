# Feature: Expense Tracker Web App (Local-Only)

## Requirements (EARS Format)
1. While a user selects a month, when the month changes, the system shall load that month's income and expenses from IndexedDB.
2. While viewing a month, when the user adds an expense with name, amount, category, and completed status, the system shall validate the input and persist the expense locally.
3. While viewing a month, when the user updates or deletes an expense, the system shall persist the change locally and refresh totals.
4. While viewing a month, when the user edits income, the system shall validate and persist the income locally.
5. While data exists, when the user views the year analysis, the system shall show category totals and counts, yearly income, total expenses, and balance.
6. While a user opts to back up, when they connect Google and submit a backup, the system shall write expenses and incomes to their Google Sheet.
7. While input is invalid, when a request is submitted, the system shall show a validation error without modifying local data.

## Architecture
- Frontend: Static UI in `public/` (HTML/CSS/JS), month selector, income form, expense table, year analysis table, IndexedDB storage, Google Sheets OAuth integration.
- Backend: Static file server only (no data persistence).
- Security: Client-side validation, output encoding via `textContent`, limited CSP, OAuth scopes restricted to Sheets, no server-side data retention.

## Implementation Plan
- [ ] Replace backend persistence with IndexedDB
- [ ] Implement local CRUD operations and summary aggregation
- [ ] Add Google Sheets OAuth token flow
- [ ] Implement backup write to Sheets (expenses + income)
- [ ] Update documentation and run manual checks
