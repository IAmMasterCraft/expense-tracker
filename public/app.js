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
const DB_VERSION = 2;

const monthSelect = document.getElementById('monthSelect');
const incomeForm = document.getElementById('incomeForm');
const incomeAmount = document.getElementById('incomeAmount');
const expenseForm = document.getElementById('expenseForm');
const expenseName = document.getElementById('expenseName');
const expenseAmount = document.getElementById('expenseAmount');
const expenseCategory = document.getElementById('expenseCategory');
const expenseCompleted = document.getElementById('expenseCompleted');
const expenseTable = document.getElementById('expenseTable');
const expenseList = document.getElementById('expenseList');
const monthIncome = document.getElementById('monthIncome');
const monthTotal = document.getElementById('monthTotal');
const monthBalance = document.getElementById('monthBalance');
const yearIncome = document.getElementById('yearIncome');
const yearExpense = document.getElementById('yearExpense');
const yearBalance = document.getElementById('yearBalance');
const analysisTable = document.getElementById('analysisTable');
const analysisList = document.getElementById('analysisList');
const analysisNote = document.getElementById('analysisNote');
const backupForm = document.getElementById('backupForm');
const googleClientId = document.getElementById('googleClientId');
const spreadsheetId = document.getElementById('spreadsheetId');
const expensesSheet = document.getElementById('expensesSheet');
const incomeSheet = document.getElementById('incomeSheet');
const connectGoogle = document.getElementById('connectGoogle');
const restoreGoogle = document.getElementById('restoreGoogle');
const autoBackup = document.getElementById('autoBackup');
const exportExpenses = document.getElementById('exportExpenses');
const exportIncome = document.getElementById('exportIncome');
const importExpenses = document.getElementById('importExpenses');
const importIncome = document.getElementById('importIncome');
const importExpensesBtn = document.getElementById('importExpensesBtn');
const importIncomeBtn = document.getElementById('importIncomeBtn');
const incomeDictate = document.getElementById('incomeDictate');
const expenseDictate = document.getElementById('expenseDictate');
const incomeDictationStatus = document.getElementById('incomeDictationStatus');
const expenseDictationStatus = document.getElementById('expenseDictationStatus');
const incomeGuided = document.getElementById('incomeGuided');
const expenseGuided = document.getElementById('expenseGuided');
const incomeSuggestions = document.getElementById('incomeSuggestions');
const expenseSuggestions = document.getElementById('expenseSuggestions');
const splash = document.getElementById('splash');
const enterApp = document.getElementById('enterApp');
const dailyPrompt = document.getElementById('dailyPrompt');
const toastHost = document.getElementById('toastHost');

let currentMonth = new Date().getMonth() + 1;
let currentExpenses = [];
let dbPromise;
let tokenClient;
let googleAccessToken = null;
let autoBackupTimer;
let activeRecognition = null;
let guidedSession = null;
let lastToastMessage = '';
let lastToastAt = 0;

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

function notify(message, type = 'info', ttlMs = 3200) {
  if (!toastHost || !message) return;
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastAt < 1800) return;
  lastToastMessage = message;
  lastToastAt = now;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastHost.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, ttlMs);
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
    request.onupgradeneeded = (event) => {
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
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }

      if (event.oldVersion < 2) {
        const expenseStore = request.transaction.objectStore('expenses');
        expenseStore.openCursor().onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          const value = cursor.value;
          if (!value.updated_at) {
            value.updated_at = value.created_at || new Date().toISOString();
            cursor.update(value);
          }
          cursor.continue();
        };

        const incomeStore = request.transaction.objectStore('incomes');
        incomeStore.openCursor().onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          const value = cursor.value;
          if (!value.updated_at) {
            value.updated_at = new Date().toISOString();
            cursor.update(value);
          }
          cursor.continue();
        };
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
  const updated_at = new Date().toISOString();
  await withStore('incomes', 'readwrite', (store) => store.put({ month, amount, updated_at }));
  await queueAutoBackup('income');
}

async function listExpensesByMonth(month) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('expenses', 'readonly');
    const store = tx.objectStore('expenses');
    const index = store.index('month');
    const request = index.getAll(month);
    request.onsuccess = () => {
      const items = (request.result || []).filter((row) => !row.deleted_at);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

async function addExpenseRecord(payload) {
  const now = new Date().toISOString();
  const record = {
    ...payload,
    created_at: now,
    updated_at: now,
    deleted_at: '',
  };
  await withStore('expenses', 'readwrite', (store) => store.add(record));
  await queueAutoBackup('expense');
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
      const updated = { ...current, ...changes, updated_at: new Date().toISOString() };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = () => reject(putReq.error);
    };
  });
}

async function deleteExpenseRecord(id) {
  await updateExpenseRecord(id, { deleted_at: new Date().toISOString() });
}

async function listAllExpenses(includeDeleted = false) {
  const result = await withStore('expenses', 'readonly', (store) => store.getAll());
  const items = result || [];
  return includeDeleted ? items : items.filter((row) => !row.deleted_at);
}

async function listAllIncomes() {
  const result = await withStore('incomes', 'readonly', (store) => store.getAll());
  return result || [];
}

async function clearSyncQueue() {
  await withStore('syncQueue', 'readwrite', (store) => store.clear());
}

async function getSyncQueueCount() {
  const result = await withStore('syncQueue', 'readonly', (store) => store.getAllKeys());
  return (result || []).length;
}

async function addSyncQueueItem(type) {
  await withStore('syncQueue', 'readwrite', (store) =>
    store.add({ type, created_at: new Date().toISOString() })
  );
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
  if (expenseTable) expenseTable.innerHTML = '';
  if (expenseList) expenseList.innerHTML = '';
  currentExpenses.forEach((expense) => {
    if (!expenseList) return;
    const card = document.createElement('div');
    card.className = 'expense-item';

    const header = document.createElement('div');
    header.className = 'expense-item-header';
    const name = document.createElement('span');
    name.textContent = expense.name;
    const amount = document.createElement('span');
    amount.textContent = formatCurrency(expense.amount);
    header.appendChild(name);
    header.appendChild(amount);

    const meta = document.createElement('div');
    meta.className = 'expense-item-meta';
    const category = document.createElement('span');
    category.textContent = expense.category;
    const status = document.createElement('span');
    status.textContent = expense.completed ? 'Completed' : 'Open';
    meta.appendChild(category);
    meta.appendChild(status);

    const actions = document.createElement('div');
    actions.className = 'expense-item-meta';
    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(expense.completed);
    checkbox.addEventListener('change', () => toggleExpense(expense.id, checkbox.checked));
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(document.createTextNode('Completed'));
    const remove = document.createElement('button');
    remove.className = 'action-button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteExpense(expense.id));
    actions.appendChild(checkboxLabel);
    actions.appendChild(remove);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(actions);
    expenseList.appendChild(card);
  });

  const total = currentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  monthTotal.textContent = formatCurrency(total);
}

async function toggleExpense(id, completed) {
  try {
    await updateExpenseRecord(id, { completed });
    notify('Expense updated.', 'success');
    await refreshAll();
  } catch (error) {
    notify(error.message || 'Unable to update expense.', 'error');
  }
}

async function deleteExpense(id) {
  try {
    await deleteExpenseRecord(id);
    notify('Expense deleted.', 'success');
    await refreshAll();
  } catch (error) {
    notify(error.message || 'Unable to delete expense.', 'error');
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

  if (analysisTable) analysisTable.innerHTML = '';
  if (analysisList) analysisList.innerHTML = '';
  CATEGORIES.forEach((category) => {
    const entry = byCategory.get(category);
    if (!analysisList) return;
    const card = document.createElement('div');
    card.className = 'analysis-item';
    const header = document.createElement('div');
    header.className = 'analysis-item-header';
    const cat = document.createElement('span');
    cat.textContent = category;
    const amount = document.createElement('span');
    amount.textContent = formatCurrency(entry.amount);
    header.appendChild(cat);
    header.appendChild(amount);

    const meta = document.createElement('div');
    meta.className = 'analysis-item-meta';
    const count = document.createElement('span');
    count.textContent = `${entry.count} items`;
    meta.appendChild(count);

    card.appendChild(header);
    card.appendChild(meta);
    analysisList.appendChild(card);
  });

  analysisNote.textContent = `Unaccounted expenses: ${formatCurrency(unaccounted)}`;
}

function updateBalance() {
  const incomeValue = Number(incomeAmount.value || 0);
  const total = currentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  monthIncome.textContent = formatCurrency(incomeValue);
  monthBalance.textContent = formatCurrency(incomeValue - total);
}

async function refreshAll() {
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
  notify(message, isError ? 'error' : 'success');
}

function updateImportStatus(message, isError = false) {
  notify(message, isError ? 'error' : 'success');
}

function updateDictationStatus(el, message, isError = false) {
  setStatus(el, message, isError);
}

function clearSuggestions(container) {
  container.innerHTML = '';
}

function renderSuggestions(container, suggestions, onSelect) {
  clearSuggestions(container);
  suggestions.forEach((suggestion) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = suggestion;
    btn.addEventListener('click', () => onSelect(suggestion));
    container.appendChild(btn);
  });
}

function getSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  return recognition;
}

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .trim();
}

function wordNumberToValue(words) {
  const units = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
  };
  const tens = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  let total = 0;
  let current = 0;
  let seen = false;

  for (const word of words) {
    if (units[word] !== undefined) {
      current += units[word];
      seen = true;
      continue;
    }
    if (tens[word] !== undefined) {
      current += tens[word];
      seen = true;
      continue;
    }
    if (word === 'hundred') {
      if (current === 0) current = 1;
      current *= 100;
      seen = true;
      continue;
    }
    if (word === 'thousand') {
      if (current === 0) current = 1;
      total += current * 1000;
      current = 0;
      seen = true;
      continue;
    }
  }

  if (!seen) return null;
  return total + current;
}

function parseNumberWords(text) {
  const normalized = normalizeWords(text).replace(/-/g, ' ');
  const tokens = normalized.split(/\s+/);
  const numberWords = new Set([
    'zero','one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen',
    'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','thousand','and'
  ]);

  const sequences = [];
  let current = [];
  for (const token of tokens) {
    if (numberWords.has(token)) {
      if (token !== 'and') current.push(token);
    } else if (current.length) {
      sequences.push(current);
      current = [];
    }
  }
  if (current.length) sequences.push(current);

  if (!sequences.length) return null;
  const value = wordNumberToValue(sequences[0]);
  return value;
}

function parseRelativeMonth(text) {
  const normalized = normalizeWords(text);
  const now = new Date();
  const current = now.getMonth() + 1;
  if (normalized.includes('last month') || normalized.includes('previous month')) {
    return current === 1 ? 12 : current - 1;
  }
  if (normalized.includes('next month')) {
    return current === 12 ? 1 : current + 1;
  }
  if (normalized.includes('this month') || normalized.includes('current month')) {
    return current;
  }
  return null;
}

function parseMonthFromText(text) {
  const normalized = normalizeWords(text);
  const relative = parseRelativeMonth(normalized);
  if (relative) return relative;
  const monthIndex = MONTHS.findIndex((month) => normalized.includes(month.toLowerCase()));
  if (monthIndex >= 0) return monthIndex + 1;
  return null;
}

function parseAmountFromText(text) {
  const match = text.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (match) return Number(match[0].replace(/,/g, ''));

  const wordNumber = parseNumberWords(text);
  return Number.isFinite(wordNumber) ? wordNumber : null;
}

function mapCategoryFromText(text) {
  const normalized = normalizeWords(text);
  const direct = CATEGORIES.find((cat) => normalized.includes(cat.toLowerCase()));
  if (direct) return direct;

  const synonyms = [
    { keys: ['grocery', 'groceries', 'food', 'dining', 'restaurant', 'coffee'], category: 'Food' },
    { keys: ['saving', 'savings'], category: 'Savings' },
    { keys: ['gift', 'donation'], category: 'Gift' },
    { keys: ['utility', 'utilities', 'bill', 'bills', 'electric', 'water', 'gas', 'internet'], category: 'Utility' },
    { keys: ['entertainment', 'movie', 'music', 'game'], category: 'Entertainment' },
    { keys: ['service', 'services', 'rent', 'subscription', 'cleaning'], category: 'Services' },
    { keys: ['misc', 'miscellaneous', 'other'], category: 'Miscellaneous' },
  ];

  const match = synonyms.find((entry) => entry.keys.some((key) => normalized.includes(key)));
  return match ? match.category : null;
}

function parseExpenseDictation(text) {
  const normalized = normalizeWords(text);
  const words = normalized.split(/\s+/);
  const amount = parseAmountFromText(normalized);
  const month = parseMonthFromText(normalized);
  const category = mapCategoryFromText(normalized);
  const completed = normalized.includes('completed') || normalized.includes('paid') || normalized.includes('done');

  const filteredWords = words.filter((word) => {
    if (amount !== null && word === String(amount)) return false;
    if (['last', 'previous', 'next', 'this', 'month', 'current'].includes(word)) return false;
    if (category && category.toLowerCase() === word) return false;
    if (MONTHS.some((monthName) => monthName.toLowerCase() === word)) return false;
    if (['completed', 'paid', 'done', 'for', 'in', 'on', 'at'].includes(word)) return false;
    return true;
  });

  const name = filteredWords.join(' ').trim();

  return {
    name: name || text.trim(),
    amount,
    category: category || expenseCategory.value,
    completed,
    month,
  };
}

function parseIncomeDictation(text) {
  const amount = parseAmountFromText(text);
  const month = parseMonthFromText(text);
  return { amount, month };
}

function parseYesNo(text) {
  const normalized = normalizeWords(text);
  if (['yes', 'yeah', 'yep', 'true', 'correct', 'sure', 'done', 'paid'].some((word) => normalized.includes(word))) {
    return true;
  }
  if (['no', 'nope', 'false', 'not', 'unfinished', 'open'].some((word) => normalized.includes(word))) {
    return false;
  }
  return null;
}

function stopActiveRecognition() {
  if (activeRecognition) {
    activeRecognition.stop();
    activeRecognition = null;
  }
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function startDictation({ target, button, statusEl }) {
  const recognition = getSpeechRecognition();
  if (!recognition) {
    updateDictationStatus(statusEl, 'Speech recognition not supported in this browser.', true);
    return;
  }

  stopActiveRecognition();
  activeRecognition = recognition;

  button.classList.add('listening');
  updateDictationStatus(statusEl, 'Listening...');

  recognition.onresult = async (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || '';
    button.classList.remove('listening');
    updateDictationStatus(statusEl, `Heard: "${transcript}"`);

    if (target === 'income') {
      const { amount, month } = parseIncomeDictation(transcript);
      if (amount === null || Number.isNaN(amount)) {
        updateDictationStatus(statusEl, 'Could not find an income amount in the dictation.', true);
        return;
      }
      if (month) {
        currentMonth = month;
        monthSelect.value = String(month);
        await refreshAll();
      }
      incomeAmount.value = amount.toFixed(2);
      return;
    }

    const parsed = parseExpenseDictation(transcript);
    if (parsed.month) {
      currentMonth = parsed.month;
      monthSelect.value = String(parsed.month);
      await refreshAll();
    }
    expenseName.value = parsed.name;
    if (parsed.amount !== null && !Number.isNaN(parsed.amount)) {
      expenseAmount.value = String(parsed.amount);
    }
    expenseCategory.value = parsed.category;
    expenseCompleted.checked = parsed.completed;
  };

  recognition.onerror = (event) => {
    button.classList.remove('listening');
    updateDictationStatus(statusEl, event.error || 'Dictation failed.', true);
  };

  recognition.onend = () => {
    button.classList.remove('listening');
    activeRecognition = null;
  };

  recognition.start();
}

function stopGuidedSession() {
  guidedSession = null;
}

function nextGuidedStep() {
  if (!guidedSession) return;
  const step = guidedSession.steps[guidedSession.stepIndex];
  if (!step) {
    stopGuidedSession();
    return;
  }

  const { prompt, statusEl, suggestionsEl } = guidedSession;
  const question = step.prompt();
  updateDictationStatus(statusEl, question);
  clearSuggestions(suggestionsEl);
  speak(question);

  const recognition = getSpeechRecognition();
  if (!recognition) {
    updateDictationStatus(statusEl, 'Speech recognition not supported in this browser.', true);
    stopGuidedSession();
    return;
  }

  stopActiveRecognition();
  activeRecognition = recognition;

  recognition.onresult = async (event) => {
    const alternatives = Array.from(event.results?.[0] || []).map((alt) => alt.transcript).filter(Boolean);
    const transcript = alternatives[0] || '';
    const parsed = step.parse(transcript, alternatives);
    if (parsed.ok) {
      step.apply(parsed.value);
      guidedSession.stepIndex += 1;
      if (step.afterApply) await step.afterApply();
      nextGuidedStep();
      return;
    }

    guidedSession.attempts += 1;
    updateDictationStatus(statusEl, parsed.message || 'I did not catch that. Please try again.', true);
    if (parsed.suggestions?.length) {
      renderSuggestions(suggestionsEl, parsed.suggestions, (choice) => {
        step.apply(choice);
        guidedSession.stepIndex += 1;
        if (step.afterApply) step.afterApply();
        nextGuidedStep();
      });
    }

    if (guidedSession.attempts < guidedSession.maxAttempts) {
      nextGuidedStep();
    } else {
      updateDictationStatus(statusEl, 'Let’s try again later or use manual entry.', true);
      stopGuidedSession();
    }
  };

  recognition.onerror = (event) => {
    updateDictationStatus(statusEl, event.error || 'Dictation failed.', true);
    stopGuidedSession();
  };

  recognition.onend = () => {
    activeRecognition = null;
  };

  recognition.start();
}

function startGuidedIncome() {
  guidedSession = {
    stepIndex: 0,
    attempts: 0,
    maxAttempts: 2,
    statusEl: incomeDictationStatus,
    suggestionsEl: incomeSuggestions,
    steps: [
      {
        prompt: () => 'What is the income amount you want to add?',
        parse: (transcript, alternatives) => {
          const { amount, month } = parseIncomeDictation(transcript);
          if (amount === null || Number.isNaN(amount)) {
            return {
              ok: false,
              message: 'Please say a number like “two thousand” or “2500”.',
              suggestions: alternatives.map((alt) => alt.trim()).slice(0, 3),
            };
          }
          return { ok: true, value: { amount, month } };
        },
        apply: async (value) => {
          if (value.month) {
            currentMonth = value.month;
            monthSelect.value = String(value.month);
            await refreshAll();
          }
          incomeAmount.value = value.amount.toFixed(2);
        },
      },
    ],
  };
  nextGuidedStep();
}

function startGuidedExpense() {
  guidedSession = {
    stepIndex: 0,
    attempts: 0,
    maxAttempts: 2,
    statusEl: expenseDictationStatus,
    suggestionsEl: expenseSuggestions,
    steps: [
      {
        prompt: () => 'What is the expense name?',
        parse: (transcript) => {
          const name = transcript.trim();
          if (!name) return { ok: false, message: 'Please say the expense name.' };
          return { ok: true, value: name };
        },
        apply: (value) => {
          expenseName.value = value;
        },
      },
      {
        prompt: () => 'What is the amount?',
        parse: (transcript, alternatives) => {
          const amount = parseAmountFromText(transcript);
          if (amount === null || Number.isNaN(amount)) {
            return {
              ok: false,
              message: 'Please say a number like “twelve fifty” or “12.50”.',
              suggestions: alternatives.map((alt) => alt.trim()).slice(0, 3),
            };
          }
          return { ok: true, value: amount };
        },
        apply: (value) => {
          expenseAmount.value = String(value);
        },
      },
      {
        prompt: () => 'Which category? You can say Food, Savings, Gift, Utility, Entertainment, Services, or Miscellaneous.',
        parse: (transcript, alternatives) => {
          const category = mapCategoryFromText(transcript);
          if (!category) {
            const suggestionList = alternatives
              .map((alt) => mapCategoryFromText(alt))
              .filter(Boolean);
            return {
              ok: false,
              message: 'Please say a category name.',
              suggestions: Array.from(new Set(suggestionList)).slice(0, 3),
            };
          }
          return { ok: true, value: category };
        },
        apply: (value) => {
          expenseCategory.value = value;
        },
      },
      {
        prompt: () => 'Is this expense completed?',
        parse: (transcript, alternatives) => {
          const value = parseYesNo(transcript);
          if (value === null) {
            return {
              ok: false,
              message: 'Please say yes or no.',
              suggestions: ['Yes', 'No'],
            };
          }
          return { ok: true, value };
        },
        apply: (value) => {
          expenseCompleted.checked = Boolean(value);
        },
      },
    ],
  };
  nextGuidedStep();
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
      updateBackupStatus('Google connected. You can back up or restore now.');
      maybeFlushQueue();
    },
  });

  return tokenClient;
}

async function connectToGoogle() {
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

async function getSheetValues(spreadsheetIdValue, range) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}/values/${encodeURIComponent(
      range
    )}`,
    {
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
      },
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || 'Sheets read failed.');
  }

  const data = await response.json();
  return data.values || [];
}

async function backupToSheets() {
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

  const [expenses, incomes] = await Promise.all([
    listAllExpenses(true),
    listAllIncomes(),
  ]);

  const expenseRows = [
    ['Id', 'Month', 'Expense', 'Amount', 'Category', 'Completed', 'Created At', 'Updated At', 'Deleted At'],
  ];
  expenses
    .sort((a, b) => {
      if (a.month === b.month) return (a.created_at || '').localeCompare(b.created_at || '');
      return a.month - b.month;
    })
    .forEach((row) => {
      expenseRows.push([
        row.id,
        MONTHS[row.month - 1] || String(row.month),
        row.name,
        row.amount,
        row.category,
        row.completed ? 'TRUE' : 'FALSE',
        row.created_at,
        row.updated_at,
        row.deleted_at || '',
      ]);
    });

  const incomeRows = [['Month', 'Income', 'Updated At']];
  MONTHS.forEach((label, index) => {
    const monthNumber = index + 1;
    const income = incomes.find((row) => row.month === monthNumber);
    incomeRows.push([label, income?.amount ?? 0, income?.updated_at ?? '']);
  });

  await updateSheetValues(spreadsheetIdValue, `${expensesSheetName}!A1`, expenseRows);
  await updateSheetValues(spreadsheetIdValue, `${incomeSheetName}!A1`, incomeRows);

  await clearSyncQueue();
  updateBackupStatus('Backup completed.');
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const row = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if (char === '\n' && !inQuotes) {
      row.push(current);
      rows.push([...row]);
      row.length = 0;
      current = '';
    } else if (char !== '\r') {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push([...row]);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          if (value.includes('"') || value.includes(',') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    )
    .join('\n');
}

function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function monthToNumber(value) {
  const trimmed = value.trim();
  const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === trimmed.toLowerCase());
  if (monthIndex >= 0) return monthIndex + 1;
  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 12) return asNumber;
  return null;
}

function parseBoolean(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

async function importExpensesCsv(file) {
  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV is empty.');

  const [header, ...data] = rows;
  const index = (name) => header.findIndex((cell) => cell.trim().toLowerCase() === name);

  const idIndex = index('id');
  const monthIndex = index('month');
  const expenseIndex = index('expense');
  const amountIndex = index('amount');
  const categoryIndex = index('category');
  const completedIndex = index('completed');
  const createdIndex = index('created at');
  const updatedIndex = index('updated at');
  const deletedIndex = index('deleted at');

  if (monthIndex < 0 || expenseIndex < 0 || amountIndex < 0) {
    throw new Error('CSV must include Month, Expense, and Amount columns.');
  }

  const db = await openDb();
  const tx = db.transaction('expenses', 'readwrite');
  const store = tx.objectStore('expenses');

  await new Promise((resolve, reject) => {
    data.forEach((row) => {
      const month = monthToNumber(row[monthIndex] || '');
      if (!month) return;
      const name = (row[expenseIndex] || '').trim();
      if (!name) return;
      const amount = Number(row[amountIndex] || 0);
      const category = (row[categoryIndex] || 'Miscellaneous').trim() || 'Miscellaneous';
      const completed = completedIndex >= 0 ? parseBoolean(row[completedIndex] || '') : false;
      const created_at = createdIndex >= 0 ? row[createdIndex] || new Date().toISOString() : new Date().toISOString();
      const updated_at = updatedIndex >= 0 ? row[updatedIndex] || created_at : created_at;
      const deleted_at = deletedIndex >= 0 ? row[deletedIndex] || '' : '';
      const idValue = idIndex >= 0 ? Number(row[idIndex]) : null;

      const record = {
        id: Number.isFinite(idValue) && idValue > 0 ? idValue : undefined,
        month,
        name,
        amount,
        category,
        completed,
        created_at,
        updated_at,
        deleted_at,
      };

      if (record.id) {
        store.put(record);
      } else {
        store.add(record);
      }
    });

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  await queueAutoBackup('import');
}

async function importIncomeCsv(file) {
  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('CSV is empty.');

  const [header, ...data] = rows;
  const index = (name) => header.findIndex((cell) => cell.trim().toLowerCase() === name);

  const monthIndex = index('month');
  const incomeIndex = index('income');
  const updatedIndex = index('updated at');

  if (monthIndex < 0 || incomeIndex < 0) {
    throw new Error('CSV must include Month and Income columns.');
  }

  const db = await openDb();
  const tx = db.transaction('incomes', 'readwrite');
  const store = tx.objectStore('incomes');

  await new Promise((resolve, reject) => {
    data.forEach((row) => {
      const month = monthToNumber(row[monthIndex] || '');
      if (!month) return;
      const amount = Number(row[incomeIndex] || 0);
      const updated_at = updatedIndex >= 0 ? row[updatedIndex] || new Date().toISOString() : new Date().toISOString();
      store.put({ month, amount, updated_at });
    });

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  await queueAutoBackup('import');
}

async function exportExpensesCsv() {
  const expenses = await listAllExpenses(true);
  const rows = [
    ['Id', 'Month', 'Expense', 'Amount', 'Category', 'Completed', 'Created At', 'Updated At', 'Deleted At'],
  ];
  expenses.forEach((row) => {
    rows.push([
      row.id,
      MONTHS[row.month - 1] || String(row.month),
      row.name,
      row.amount,
      row.category,
      row.completed ? 'TRUE' : 'FALSE',
      row.created_at,
      row.updated_at,
      row.deleted_at || '',
    ]);
  });
  downloadCsv('expenses.csv', rows);
}

async function exportIncomeCsv() {
  const incomes = await listAllIncomes();
  const rows = [['Month', 'Income', 'Updated At']];
  MONTHS.forEach((label, index) => {
    const monthNumber = index + 1;
    const income = incomes.find((row) => row.month === monthNumber);
    rows.push([label, income?.amount ?? 0, income?.updated_at ?? '']);
  });
  downloadCsv('income.csv', rows);
}

async function restoreFromSheets() {
  if (!googleAccessToken) {
    updateBackupStatus('Connect Google before restoring.', true);
    return;
  }

  const spreadsheetIdValue = spreadsheetId.value.trim();
  if (!spreadsheetIdValue) {
    updateBackupStatus('Spreadsheet ID is required.', true);
    return;
  }

  const expensesSheetName = sanitizeSheetName(expensesSheet.value, 'Expenses');
  const incomeSheetName = sanitizeSheetName(incomeSheet.value, 'Income');

  const [expenseRows, incomeRows] = await Promise.all([
    getSheetValues(spreadsheetIdValue, `${expensesSheetName}`),
    getSheetValues(spreadsheetIdValue, `${incomeSheetName}`),
  ]);

  if (!expenseRows.length && !incomeRows.length) {
    updateBackupStatus('No data found in the provided sheets.', true);
    return;
  }

  const [expenseHeader, ...expenseData] = expenseRows;
  const [incomeHeader, ...incomeData] = incomeRows;

  const expIndex = (name) =>
    expenseHeader?.findIndex((cell) => cell.trim().toLowerCase() === name) ?? -1;
  const incIndex = (name) =>
    incomeHeader?.findIndex((cell) => cell.trim().toLowerCase() === name) ?? -1;

  const idIndex = expIndex('id');
  const monthIndex = expIndex('month');
  const expenseIndex = expIndex('expense');
  const amountIndex = expIndex('amount');
  const categoryIndex = expIndex('category');
  const completedIndex = expIndex('completed');
  const createdIndex = expIndex('created at');
  const updatedIndex = expIndex('updated at');
  const deletedIndex = expIndex('deleted at');

  const incomeMonthIndex = incIndex('month');
  const incomeAmountIndex = incIndex('income');
  const incomeUpdatedIndex = incIndex('updated at');

  if (monthIndex < 0 || expenseIndex < 0 || amountIndex < 0) {
    throw new Error('Expenses sheet is missing required columns.');
  }

  if (incomeMonthIndex < 0 || incomeAmountIndex < 0) {
    throw new Error('Income sheet is missing required columns.');
  }

  const localExpenses = await listAllExpenses(true);
  const expenseMap = new Map(localExpenses.map((row) => [row.id, row]));

  const db = await openDb();
  const expenseTx = db.transaction('expenses', 'readwrite');
  const expenseStore = expenseTx.objectStore('expenses');

  await new Promise((resolve, reject) => {
    expenseData.forEach((row) => {
      const month = monthToNumber(row[monthIndex] || '');
      if (!month) return;
      const name = (row[expenseIndex] || '').trim();
      if (!name) return;
      const idValue = idIndex >= 0 ? Number(row[idIndex]) : null;
      if (!Number.isFinite(idValue) || idValue <= 0) return;

      const record = {
        id: idValue,
        month,
        name,
        amount: Number(row[amountIndex] || 0),
        category: (row[categoryIndex] || 'Miscellaneous').trim() || 'Miscellaneous',
        completed: completedIndex >= 0 ? parseBoolean(row[completedIndex] || '') : false,
        created_at: createdIndex >= 0 ? row[createdIndex] || new Date().toISOString() : new Date().toISOString(),
        updated_at: updatedIndex >= 0 ? row[updatedIndex] || new Date().toISOString() : new Date().toISOString(),
        deleted_at: deletedIndex >= 0 ? row[deletedIndex] || '' : '',
      };

      const local = expenseMap.get(record.id);
      if (!local || record.updated_at > (local.updated_at || '')) {
        expenseStore.put(record);
      }
    });

    expenseTx.oncomplete = resolve;
    expenseTx.onerror = () => reject(expenseTx.error);
  });

  const incomes = await listAllIncomes();
  const incomeMap = new Map(incomes.map((row) => [row.month, row]));

  const incomeTx = db.transaction('incomes', 'readwrite');
  const incomeStore = incomeTx.objectStore('incomes');

  await new Promise((resolve, reject) => {
    incomeData.forEach((row) => {
      const month = monthToNumber(row[incomeMonthIndex] || '');
      if (!month) return;
      const amount = Number(row[incomeAmountIndex] || 0);
      const updated_at = incomeUpdatedIndex >= 0 ? row[incomeUpdatedIndex] || new Date().toISOString() : new Date().toISOString();

      const local = incomeMap.get(month);
      if (!local || updated_at > (local.updated_at || '')) {
        incomeStore.put({ month, amount, updated_at });
      }
    });

    incomeTx.oncomplete = resolve;
    incomeTx.onerror = () => reject(incomeTx.error);
  });

  await refreshAll();
  updateBackupStatus('Restore completed using last-write-wins.');
}

async function queueAutoBackup(type) {
  const enabled = await getSetting('autoBackup');
  if (!enabled) return;
  await addSyncQueueItem(type);
  scheduleAutoBackup();
}

function scheduleAutoBackup() {
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    maybeFlushQueue();
  }, 1500);
}

async function maybeFlushQueue() {
  const enabled = await getSetting('autoBackup');
  if (!enabled) return;
  const queueCount = await getSyncQueueCount();
  if (!queueCount) return;
  if (!googleAccessToken || !navigator.onLine) {
    updateBackupStatus('Auto-backup queued (offline or not connected).');
    return;
  }
  try {
    await backupToSheets();
  } catch (error) {
    updateBackupStatus(error.message, true);
  }
}

async function loadSettings() {
  googleClientId.value = await getSetting('googleClientId');
  spreadsheetId.value = await getSetting('spreadsheetId');
  expensesSheet.value = (await getSetting('expensesSheet')) || 'Expenses';
  incomeSheet.value = (await getSetting('incomeSheet')) || 'Income';
  autoBackup.checked = Boolean(await getSetting('autoBackup'));
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

  const amount = Number(incomeAmount.value || 0);
  if (Number.isNaN(amount) || amount < 0) {
    notify('Income must be a positive number.', 'error');
    return;
  }

  try {
    await saveIncome(amount);
    notify('Income saved.', 'success');
    updateBalance();
    await loadYearSummary();
  } catch (error) {
    notify(error.message || 'Unable to save income.', 'error');
  }
});

expenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    name: expenseName.value.trim(),
    amount: Number(expenseAmount.value || 0),
    category: expenseCategory.value,
    completed: expenseCompleted.checked,
    month: currentMonth,
  };

  if (!payload.name) {
    notify('Expense name is required.', 'error');
    return;
  }

  if (Number.isNaN(payload.amount) || payload.amount < 0) {
    notify('Expense amount must be positive.', 'error');
    return;
  }

  try {
    await addExpense(payload);
    notify('Expense added.', 'success');
    expenseName.value = '';
    expenseAmount.value = '';
    expenseCompleted.checked = false;
    await refreshAll();
  } catch (error) {
    notify(error.message || 'Unable to add expense.', 'error');
  }
});

connectGoogle.addEventListener('click', async () => {
  await connectToGoogle();
});

restoreGoogle.addEventListener('click', async () => {
  if (!confirm('Restore will merge by last update time. Continue?')) return;
  try {
    await restoreFromSheets();
  } catch (error) {
    updateBackupStatus(error.message, true);
  }
});

backupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await backupToSheets();
  } catch (error) {
    updateBackupStatus(error.message, true);
  }
});

autoBackup.addEventListener('change', async (event) => {
  await setSetting('autoBackup', event.target.checked);
  if (event.target.checked) {
    scheduleAutoBackup();
  }
});

exportExpenses.addEventListener('click', async () => {
  await exportExpensesCsv();
});

exportIncome.addEventListener('click', async () => {
  await exportIncomeCsv();
});

importExpensesBtn.addEventListener('click', async () => {
  const file = importExpenses.files?.[0];
  if (!file) return updateImportStatus('Select an expenses CSV file first.', true);
  try {
    await importExpensesCsv(file);
    updateImportStatus('Expenses imported.');
    await refreshAll();
  } catch (error) {
    updateImportStatus(error.message, true);
  }
});

importIncomeBtn.addEventListener('click', async () => {
  const file = importIncome.files?.[0];
  if (!file) return updateImportStatus('Select an income CSV file first.', true);
  try {
    await importIncomeCsv(file);
    updateImportStatus('Income imported.');
    await refreshAll();
  } catch (error) {
    updateImportStatus(error.message, true);
  }
});

incomeDictate.addEventListener('click', () => {
  startDictation({ target: 'income', button: incomeDictate, statusEl: incomeDictationStatus });
});

expenseDictate.addEventListener('click', () => {
  startDictation({ target: 'expense', button: expenseDictate, statusEl: expenseDictationStatus });
});

incomeGuided.addEventListener('click', () => {
  startGuidedIncome();
});

expenseGuided.addEventListener('click', () => {
  startGuidedExpense();
});

window.addEventListener('online', () => {
  maybeFlushQueue();
});

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((btn) => btn.classList.remove('active'));
      panels.forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach((panel) => {
        if (panel.dataset.tabPanel === target) {
          panel.classList.add('active');
        }
      });
    });
  });
}

function setDailyPrompt() {
  if (!dailyPrompt) return;
  const prompts = [
    'Make room for what tastes good.',
    'Spend softly, save boldly.',
    'Small choices, quiet abundance.',
    'Make today’s spending feel intentional.',
    'Nourish your budget with care.',
    'Savor the wins, trim the noise.',
    'Give every dollar a warm purpose.',
    'Let your money breathe.',
  ];
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today - start;
  const day = Math.floor(diff / 86400000);
  dailyPrompt.textContent = prompts[day % prompts.length];
}

function initSplash() {
  if (!splash) return;
  const hideSplash = () => splash.classList.add('hidden');
  enterApp?.addEventListener('click', hideSplash);
  setTimeout(hideSplash, 4200);
}

loadSettings()
  .then(() => {
    initTabs();
    initSplash();
    setDailyPrompt();
    return refreshAll();
  })
  .catch((error) => {
    notify(error.message || 'Unable to initialize app.', 'error');
  });
