const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CATEGORIES = [
  'Food',
  'Savings',
  'Gift',
  'Utility',
  'Entertainment',
  'Miscellaneous',
  'Services',
];

const DB_NAME = 'expense-tracker-db';
const DB_VERSION = 1;

const monthSelect = document.getElementById('monthSelect');
const incomeForm = document.getElementById('incomeForm');
const incomeAmount = document.getElementById('incomeAmount');
const incomeStatus = document.getElementById('incomeStatus');
const expenseForm = document.getElementById('expenseForm');
const expenseName = document.getElementById('expenseName');
const expenseAmount = document.getElementById('expenseAmount');
const expenseCategory = document.getElementById('expenseCategory');
const expenseCompleted = document.getElementById('expenseCompleted');
const expenseStatus = document.getElementById('expenseStatus');
const expenseTable = document.getElementById('expenseTable');
const monthTotal = document.getElementById('monthTotal');
const monthBalance = document.getElementById('monthBalance');
const yearIncome = document.getElementById('yearIncome');
const yearExpense = document.getElementById('yearExpense');
const yearBalance = document.getElementById('yearBalance');
const analysisTable = document.getElementById('analysisTable');
const analysisNote = document.getElementById('analysisNote');
const backupForm = document.getElementById('backupForm');
const googleClientId = document.getElementById('googleClientId');
const spreadsheetId = document.getElementById('spreadsheetId');
const expensesSheet = document.getElementById('expensesSheet');
const incomeSheet = document.getElementById('incomeSheet');
const connectGoogle = document.getElementById('connectGoogle');
const backupStatus = document.getElementById('backupStatus');

let currentMonth = new Date().getMonth() + 1;
let currentExpenses = [];
let dbPromise;
let tokenClient;
let googleAccessToken = null;

function formatCurrency(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(number);
}

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? '#b91c1c' : '';
}

function clearStatus(el) {
  el.textContent = '';
  el.style.color = '';
}

function buildSelectOptions(select, options) {
  select.innerHTML = '';
  options.forEach((label, index) => {
    const opt = document.createElement('option');
    opt.value = index + 1;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

function buildCategoryOptions(select) {
  select.innerHTML = '';
  CATEGORIES.forEach((category) => {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = category;
    select.appendChild(opt);
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('expenses')) {
        const store = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
        store.createIndex('month', 'month', { unique: false });
      }
      if (!db.objectStoreNames.contains('incomes')) {
        db.createObjectStore('incomes', { keyPath: 'month' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

async function withStore(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error || request?.error);
  });
}

async function getIncome(month) {
  const result = await withStore('incomes', 'readonly', (store) => store.get(month));
  return result?.amount ?? 0;
}

async function setIncome(month, amount) {
  await withStore('incomes', 'readwrite', (store) => store.put({ month, amount }));
}

async function listExpensesByMonth(month) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readonly');
    const store = tx.objectStore('expenses');
    const index = store.index('month');
    const request = index.getAll(month);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function addExpenseRecord(payload) {
  const record = {
    ...payload,
    created_at: new Date().toISOString(),
  };
  await withStore('expenses', 'readwrite', (store) => store.add(record));
}

async function updateExpenseRecord(id, changes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readwrite');
    const store = tx.objectStore('expenses');
    const getReq = store.get(id);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const current = getReq.result;
      if (!current) {
        resolve(null);
        return;
      }
      const updated = { ...current, ...changes };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
  });
}

async function deleteExpenseRecord(id) {
  await withStore('expenses', 'readwrite', (store) => store.delete(id));
}

async function listAllExpenses() {
  const result = await withStore('expenses', 'readonly', (store) => store.getAll());
  return result || [];
}

async function listAllIncomes() {
  const result = await withStore('incomes', 'readonly', (store) => store.getAll());
  return result || [];
}

async function getSetting(key) {
  const result = await withStore('settings', 'readonly', (store) => store.get(key));
  return result?.value ?? '';
}

async function setSetting(key, value) {
  await withStore('settings', 'readwrite', (store) => store.put({ key, value }));
}

async function loadIncome() {
  const amount = await getIncome(currentMonth);
  incomeAmount.value = amount.toFixed(2);
}

async function saveIncome(amount) {
  await setIncome(currentMonth, amount);
}

async function loadExpenses() {
  const data = await listExpensesByMonth(currentMonth);
  currentExpenses = data.sort((a, b) => {
    if (a.created_at === b.created_at) return b.id - a.id;
    return a.created_at < b.created_at ? 1 : -1;
  });
  renderExpenses();
}

function renderExpenses() {
  expenseTable.innerHTML = '';
  currentExpenses.forEach((expense) => {
    const row = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = expense.name;

    const amount = document.createElement('td');
    amount.textContent = formatCurrency(expense.amount);

    const category = document.createElement('td');
    category.textContent = expense.category;

    const completed = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(expense.completed);
    checkbox.addEventListener('change', () => toggleExpense(expense.id, checkbox.checked));
    completed.appendChild(checkbox);

    const actions = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'action-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteExpense(expense.id));
    actions.appendChild(remove);

    row.appendChild(name);
    row.appendChild(amount);
    row.appendChild(category);
    row.appendChild(completed);
    row.appendChild(actions);
    expenseTable.appendChild(row);
  });

  const total = currentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  monthTotal.textContent = formatCurrency(total);
}

async function toggleExpense(id, completed) {
  try {
    await updateExpenseRecord(id, { completed });
    await refreshAll();
  } catch (error) {
    setStatus(expenseStatus, error.message, true);
  }
}

async function deleteExpense(id) {
  try {
    await deleteExpenseRecord(id);
    await refreshAll();
  } catch (error) {
    setStatus(expenseStatus, error.message, true);
  }
}

async function addExpense(payload) {
  await addExpenseRecord(payload);
}

async function loadYearSummary() {
  const [expenses, incomes] = await Promise.all([listAllExpenses(), listAllIncomes()]);
  const incomeTotal = incomes.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  yearIncome.textContent = formatCurrency(incomeTotal);
  yearExpense.textContent = formatCurrency(expenseTotal);
  yearBalance.textContent = formatCurrency(incomeTotal - expenseTotal);

  const byCategory = new Map();
  CATEGORIES.forEach((category) => {
    byCategory.set(category, { amount: 0, count: 0 });
  });

  let unaccounted = 0;
  expenses.forEach((row) => {
    const entry = byCategory.get(row.category);
    if (!entry) {
      unaccounted += Number(row.amount || 0);
      return;
    }
    entry.amount += Number(row.amount || 0);
    entry.count += 1;
  });

  analysisTable.innerHTML = '';
  CATEGORIES.forEach((category) => {
    const entry = byCategory.get(category);
    const tr = document.createElement('tr');
    const cat = document.createElement('td');
    cat.textContent = category;
    const amount = document.createElement('td');
    amount.textContent = formatCurrency(entry.amount);
    const count = document.createElement('td');
    count.textContent = String(entry.count);
    tr.appendChild(cat);
    tr.appendChild(amount);
    tr.appendChild(count);
    analysisTable.appendChild(tr);
  });

  analysisNote.textContent = `Unaccounted expenses: ${formatCurrency(unaccounted)}`;
}

function updateBalance() {
  const incomeValue = Number(incomeAmount.value || 0);
  const total = currentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  monthBalance.textContent = formatCurrency(incomeValue - total);
}

async function refreshAll() {
  clearStatus(expenseStatus);
  await loadIncome();
  await loadExpenses();
  updateBalance();
  await loadYearSummary();
}

function sanitizeSheetName(name, fallback) {
  const value = name.trim();
  return value.length ? value : fallback;
}

function updateBackupStatus(message, isError = false) {
  setStatus(backupStatus, message, isError);
}

async function initGoogleTokenClient() {
  const clientId = googleClientId.value.trim();
  if (!clientId) {
    updateBackupStatus('Google Client ID is required to connect.', true);
    return null;
  }
  if (!window.google || !window.google.accounts?.oauth2) {
    updateBackupStatus('Google Identity Services library not loaded yet.', true);
    return null;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    callback: (response) => {
      if (response.error) {
        updateBackupStatus(response.error_description || 'Google auth failed.', true);
        return;
      }
      googleAccessToken = response.access_token;
      updateBackupStatus('Google connected. You can back up now.');
    },
  });

  return tokenClient;
}

async function connectToGoogle() {
  clearStatus(backupStatus);
  await setSetting('googleClientId', googleClientId.value.trim());

  const client = await initGoogleTokenClient();
  if (!client) return;
  client.requestAccessToken({ prompt: '' });
}

async function updateSheetValues(spreadsheetIdValue, range, values) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}/values/${encodeURIComponent(
      range
    )}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || 'Sheets update failed.');
  }
}

async function backupToSheets() {
  clearStatus(backupStatus);

  if (!googleAccessToken) {
    updateBackupStatus('Connect Google before backing up.', true);
    return;
  }

  const spreadsheetIdValue = spreadsheetId.value.trim();
  if (!spreadsheetIdValue) {
    updateBackupStatus('Spreadsheet ID is required.', true);
    return;
  }

  const expensesSheetName = sanitizeSheetName(expensesSheet.value, 'Expenses');
  const incomeSheetName = sanitizeSheetName(incomeSheet.value, 'Income');

  await Promise.all([
    setSetting('spreadsheetId', spreadsheetIdValue),
    setSetting('expensesSheet', expensesSheetName),
    setSetting('incomeSheet', incomeSheetName),
  ]);

  const [expenses, incomes] = await Promise.all([listAllExpenses(), listAllIncomes()]);

  const expenseRows = [
    ['Month', 'Expense', 'Amount', 'Category', 'Completed', 'Created At'],
  ];
  expenses
    .sort((a, b) => {
      if (a.month === b.month) return (a.created_at || '').localeCompare(b.created_at || '');
      return a.month - b.month;
    })
    .forEach((row) => {
      expenseRows.push([
        MONTHS[row.month - 1] || String(row.month),
        row.name,
        row.amount,
        row.category,
        row.completed ? 'TRUE' : 'FALSE',
        row.created_at,
      ]);
    });

  const incomeRows = [['Month', 'Income']];
  MONTHS.forEach((label, index) => {
    const monthNumber = index + 1;
    const income = incomes.find((row) => row.month === monthNumber)?.amount ?? 0;
    incomeRows.push([label, income]);
  });

  await updateSheetValues(spreadsheetIdValue, `${expensesSheetName}!A1`, expenseRows);
  await updateSheetValues(spreadsheetIdValue, `${incomeSheetName}!A1`, incomeRows);

  updateBackupStatus('Backup completed.');
}

async function loadSettings() {
  googleClientId.value = await getSetting('googleClientId');
  spreadsheetId.value = await getSetting('spreadsheetId');
  expensesSheet.value = (await getSetting('expensesSheet')) || 'Expenses';
  incomeSheet.value = (await getSetting('incomeSheet')) || 'Income';
}

buildSelectOptions(monthSelect, MONTHS);
monthSelect.value = String(currentMonth);
buildCategoryOptions(expenseCategory);

monthSelect.addEventListener('change', async (event) => {
  currentMonth = Number(event.target.value);
  await refreshAll();
});

incomeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus(incomeStatus);

  const amount = Number(incomeAmount.value || 0);
  if (Number.isNaN(amount) || amount < 0) {
    return setStatus(incomeStatus, 'Income must be a positive number.', true);
  }

  try {
    await saveIncome(amount);
    setStatus(incomeStatus, 'Income saved.');
    updateBalance();
    await loadYearSummary();
  } catch (error) {
    setStatus(incomeStatus, error.message, true);
  }
});

expenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearStatus(expenseStatus);

  const payload = {
    name: expenseName.value.trim(),
    amount: Number(expenseAmount.value || 0),
    category: expenseCategory.value,
    completed: expenseCompleted.checked,
    month: currentMonth,
  };

  if (!payload.name) {
    return setStatus(expenseStatus, 'Expense name is required.', true);
  }

  if (Number.isNaN(payload.amount) || payload.amount < 0) {
    return setStatus(expenseStatus, 'Expense amount must be positive.', true);
  }

  try {
    await addExpense(payload);
    expenseName.value = '';
    expenseAmount.value = '';
    expenseCompleted.checked = false;
    await refreshAll();
  } catch (error) {
    setStatus(expenseStatus, error.message, true);
  }
});

connectGoogle.addEventListener('click', async () => {
  await connectToGoogle();
});

backupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await backupToSheets();
  } catch (error) {
    updateBackupStatus(error.message, true);
  }
});

loadSettings()
  .then(refreshAll)
  .catch((error) => {
    setStatus(expenseStatus, error.message, true);
  });
