// ------------------------------------------------------------------
// FamFunds — app.js
// ------------------------------------------------------------------

const CATEGORIES = ['Groceries', 'Electricity Bill', 'LPG Cylinder', 'Milk', 'Non-veg', 'Laundry', 'Fuel', 'Restaurants', 'Miscellaneous'];

const state = {
  pin: localStorage.getItem('famfunds_pin') || '',
  month: monthString(new Date()),
  tab: 'dashboard',
  properties: [],
};

// ---------- helpers ----------
function monthString(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function inr(n) {
  n = Number(n) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function api(action, params = {}) {
  const q = new URLSearchParams({ action, pin: state.pin, ...params });
  const res = await fetch(SCRIPT_URL + '?' + q.toString());
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data.data;
}

// ---------- login ----------
let pinBuffer = '';

function initLogin() {
  document.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      if (val === 'back') {
        pinBuffer = pinBuffer.slice(0, -1);
      } else if (val === 'clear') {
        pinBuffer = '';
      } else if (pinBuffer.length < 4) {
        pinBuffer += val;
      }
      renderPinDots();
      if (pinBuffer.length === 4) tryLogin();
    });
  });
}

function renderPinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinBuffer.length);
  });
}

async function tryLogin() {
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const q = new URLSearchParams({ action: 'login', pin: pinBuffer });
    const res = await fetch(SCRIPT_URL + '?' + q.toString());
    const data = await res.json();
    if (data.ok) {
      state.pin = pinBuffer;
      localStorage.setItem('famfunds_pin', pinBuffer);
      enterApp();
    } else {
      errEl.textContent = 'Incorrect PIN, try again';
      pinBuffer = '';
      renderPinDots();
    }
  } catch (e) {
    errEl.textContent = 'Could not reach the ledger. Check your connection.';
    pinBuffer = '';
    renderPinDots();
  }
}

async function silentLogin() {
  if (!state.pin) return false;
  try {
    const q = new URLSearchParams({ action: 'login', pin: state.pin });
    const res = await fetch(SCRIPT_URL + '?' + q.toString());
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return false;
  }
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadProperties().then(() => renderTab());
}

// ---------- month nav ----------
function shiftMonth(delta) {
  const [y, mo] = state.month.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  state.month = monthString(d);
  document.getElementById('month-label').textContent = monthLabel(state.month);
  renderTab();
}

// ---------- tabs ----------
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  document.querySelectorAll('nav.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderTab();
}

function renderTab() {
  if (state.tab === 'dashboard') renderDashboard();
  else if (state.tab === 'rent') renderRent();
  else if (state.tab === 'income') renderIncome();
  else if (state.tab === 'expenses') renderExpenses();
  else if (state.tab === 'more') renderProperties();
}

// ---------- properties ----------
async function loadProperties() {
  try {
    state.properties = await api('properties');
  } catch (e) {
    toast(e.message);
  }
}

// ---------- DASHBOARD ----------
async function renderDashboard() {
  const el = document.getElementById('tab-dashboard');
  el.innerHTML = '<div class="loading-note">Reading the ledger…</div>';
  try {
    const data = await api('dashboard', { month: state.month });
    const netClass = data.net >= 0 ? 'positive' : 'negative';
    let html = '';

    html += `<div class="card net-card">
      <div class="net-label">Net for ${monthLabel(state.month)}</div>
      <div class="net-figure ${netClass}">${inr(data.net)}</div>
      <div class="stat-row">
        <div class="stat"><div class="stat-val">${inr(data.income.total)}</div><div class="stat-name">Income</div></div>
        <div class="stat"><div class="stat-val">${inr(data.expenses.total)}</div><div class="stat-name">Expenses</div></div>
      </div>
    </div>`;

    html += `<div class="card">
      <div class="card-title">Income sources</div>
      <div class="entry-row"><div class="entry-main"><div class="entry-title">Rent collected</div></div><div class="entry-amt">${inr(data.income.rent)}</div></div>
      <div class="entry-row"><div class="entry-main"><div class="entry-title">Loan interest</div></div><div class="entry-amt">${inr(data.income.interest)}</div></div>
      <div class="entry-row"><div class="entry-main"><div class="entry-title">Others</div></div><div class="entry-amt">${inr(data.income.others)}</div></div>
    </div>`;

    const maxCat = Math.max(1, ...Object.values(data.expenses.byCategory));
    let catRows = CATEGORIES.map(c => {
      const amt = data.expenses.byCategory[c] || 0;
      const pct = Math.round((amt / maxCat) * 100);
      return `<div class="cat-row">
        <div class="cat-name">${c}</div>
        <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${amt ? Math.max(pct, 4) : 0}%"></div></div>
        <div class="cat-amt">${inr(amt)}</div>
      </div>`;
    }).join('');
    html += `<div class="card"><div class="card-title">Expenses by category</div>${catRows}</div>`;

    let pendingHtml;
    if (data.pendingRents.length === 0) {
      pendingHtml = '<div class="empty-note">No pending rents this month 🎉</div>';
    } else {
      pendingHtml = data.pendingRents.map(p => `
        <div class="pending-item">
          <div>
            <div class="entry-title">${p.renterName}</div>
            <div class="entry-sub">${p.propertyName}</div>
          </div>
          <div style="text-align:right">
            <div class="entry-amt">${inr(p.amountDue)}</div>
            <span class="stamp ${p.status.toLowerCase()}">${p.status}</span>
          </div>
        </div>`).join('');
    }
    html += `<div class="card"><div class="card-title">Pending rents ⚑</div>${pendingHtml}</div>`;

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty-note">${e.message}</div>`;
  }
}

// ---------- RENT ----------
async function renderRent() {
  const el = document.getElementById('tab-rent');
  el.innerHTML = '<div class="loading-note">Reading the ledger…</div>';
  try {
    const rows = await api('rent', { month: state.month });
    if (rows.length === 0) {
      el.innerHTML = '<div class="card"><div class="empty-note">No properties yet. Add one from the More tab.</div></div>';
      return;
    }
    const items = rows.map(r => {
      const outstanding = Number(r.AmountDue) - Number(r.AmountPaid || 0);
      const statusClass = r.Status.toLowerCase();
      return `<div class="card">
        <div class="entry-row" style="border:none;padding:0">
          <div class="entry-main">
            <div class="entry-title">${r.PropertyName}</div>
            <div class="entry-sub">Renter: ${r.RenterName}</div>
            <div class="entry-sub">Due: ${inr(r.AmountDue)}${r.AmountPaid ? '  ·  Paid: ' + inr(r.AmountPaid) : ''}</div>
          </div>
          <div style="text-align:right">
            <span class="stamp ${statusClass}">${r.Status}</span>
          </div>
        </div>
        ${r.Status !== 'Paid' ? `<button class="btn btn-primary btn-block" style="margin-top:12px" onclick="openMarkPaidModal('${r.ID}', ${outstanding}, '${r.PropertyName.replace(/'/g, "\\'")}')">Mark payment</button>` : ''}
      </div>`;
    }).join('');
    el.innerHTML = items;
  } catch (e) {
    el.innerHTML = `<div class="empty-note">${e.message}</div>`;
  }
}

function openMarkPaidModal(id, suggestedAmount, propName) {
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = 'Record payment — ' + propName;
  body.innerHTML = `
    <div class="field"><label>Amount paid</label><input type="number" id="mp-amount" value="${suggestedAmount}" /></div>
    <div class="field"><label>Date paid</label><input type="date" id="mp-date" value="${todayStr()}" /></div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="mp-notes" placeholder="e.g. paid via UPI" /></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary btn-block" onclick="submitMarkPaid('${id}')">Save</button>
    </div>`;
  openModal();
}

async function submitMarkPaid(id) {
  const amountPaid = document.getElementById('mp-amount').value;
  const datePaid = document.getElementById('mp-date').value;
  const notes = document.getElementById('mp-notes').value;
  try {
    await api('markRentPaid', { id, amountPaid, datePaid, notes });
    closeModal();
    toast('Payment recorded');
    renderRent();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- INCOME ----------
let incomeType = 'Interest';

async function renderIncome() {
  const el = document.getElementById('tab-income');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Add income</div>
      <div class="pill-toggle">
        <button class="${incomeType === 'Interest' ? 'active' : ''}" onclick="setIncomeType('Interest')">Loan interest</button>
        <button class="${incomeType === 'Others' ? 'active' : ''}" onclick="setIncomeType('Others')">Others</button>
      </div>
      <div class="field"><label>Description</label><input type="text" id="inc-desc" placeholder="${incomeType === 'Interest' ? 'e.g. interest from Raman' : 'e.g. dividend payout'}" /></div>
      <div class="field"><label>Amount</label><input type="number" id="inc-amount" placeholder="0" /></div>
      <div class="field"><label>Date</label><input type="date" id="inc-date" value="${todayStr()}" /></div>
      <button class="btn btn-primary btn-block" onclick="submitIncome()">Save entry</button>
    </div>
    <div class="section-label">This month</div>
    <div class="card" id="income-list"><div class="loading-note">Loading…</div></div>
  `;
  try {
    const rows = await api('incomeList', { month: state.month });
    const listEl = document.getElementById('income-list');
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="empty-note">No income entries yet this month.</div>';
    } else {
      listEl.innerHTML = rows.map(r => `
        <div class="entry-row">
          <div class="entry-main">
            <div class="entry-title">${r.Description || r.Type}</div>
            <div class="entry-sub">${r.Type} · ${r.Date}</div>
          </div>
          <div class="entry-actions">
            <div class="entry-amt">${inr(r.Amount)}</div>
            <button class="btn btn-ghost" onclick="deleteEntry('${r.Type === 'Interest' ? 'Interest' : 'Others'}', '${r.ID}', 'income')">✕</button>
          </div>
        </div>`).join('');
    }
  } catch (e) {
    document.getElementById('income-list').innerHTML = `<div class="empty-note">${e.message}</div>`;
  }
}

function setIncomeType(t) {
  incomeType = t;
  renderIncome();
}

async function submitIncome() {
  const description = document.getElementById('inc-desc').value;
  const amount = document.getElementById('inc-amount').value;
  const date = document.getElementById('inc-date').value;
  if (!amount || Number(amount) <= 0) { toast('Enter an amount'); return; }
  try {
    const action = incomeType === 'Interest' ? 'addInterest' : 'addOther';
    await api(action, { description, amount, date });
    toast('Income added');
    renderIncome();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- EXPENSES ----------
async function renderExpenses() {
  const el = document.getElementById('tab-expenses');
  const options = CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Add expense</div>
      <div class="field"><label>Category</label><select id="exp-cat">${options}</select></div>
      <div class="field"><label>Description (optional)</label><input type="text" id="exp-desc" placeholder="e.g. Big Bazaar" /></div>
      <div class="field"><label>Amount</label><input type="number" id="exp-amount" placeholder="0" /></div>
      <div class="field"><label>Date</label><input type="date" id="exp-date" value="${todayStr()}" /></div>
      <button class="btn btn-primary btn-block" onclick="submitExpense()">Save expense</button>
    </div>
    <div class="section-label">This month</div>
    <div class="card" id="expense-list"><div class="loading-note">Loading…</div></div>
  `;
  try {
    const rows = await api('expenseList', { month: state.month });
    const listEl = document.getElementById('expense-list');
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="empty-note">No expenses logged yet this month.</div>';
    } else {
      listEl.innerHTML = rows.map(r => `
        <div class="entry-row">
          <div class="entry-main">
            <div class="entry-title">${r.Category}</div>
            <div class="entry-sub">${r.Description ? r.Description + ' · ' : ''}${r.Date}</div>
          </div>
          <div class="entry-actions">
            <div class="entry-amt">${inr(r.Amount)}</div>
            <button class="btn btn-ghost" onclick="deleteEntry('Expenses', '${r.ID}', 'expenses')">✕</button>
          </div>
        </div>`).join('');
    }
  } catch (e) {
    document.getElementById('expense-list').innerHTML = `<div class="empty-note">${e.message}</div>`;
  }
}

async function submitExpense() {
  const category = document.getElementById('exp-cat').value;
  const description = document.getElementById('exp-desc').value;
  const amount = document.getElementById('exp-amount').value;
  const date = document.getElementById('exp-date').value;
  if (!amount || Number(amount) <= 0) { toast('Enter an amount'); return; }
  try {
    await api('addExpense', { category, description, amount, date });
    toast('Expense added');
    renderExpenses();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- MORE / PROPERTIES ----------
async function renderProperties() {
  const el = document.getElementById('tab-more');
  await loadProperties();
  const list = state.properties.map(p => `
    <div class="entry-row">
      <div class="entry-main">
        <div class="entry-title">${p.Name}</div>
        <div class="entry-sub">Renter: ${p.RenterName} · Deposit: ${inr(p.Deposit)} · Rent: ${inr(p.MonthlyRent)}/mo</div>
      </div>
      <button class="btn btn-ghost" onclick="openEditPropertyModal('${p.ID}')">Edit</button>
    </div>`).join('') || '<div class="empty-note">No properties added yet.</div>';

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Rental properties</div>
      ${list}
      <button class="btn btn-outline btn-block" style="margin-top:14px" onclick="openAddPropertyModal()">+ Add property</button>
    </div>
    <div class="card">
      <div class="card-title">About FamFunds</div>
      <div class="entry-sub">Data is stored in your family Google Sheet. Everyone with the PIN can add entries from their own phone.</div>
    </div>
  `;
}

function openAddPropertyModal() {
  document.getElementById('modal-title').textContent = 'Add rental property';
  document.getElementById('modal-body').innerHTML = `
    <div class="field"><label>Property name</label><input type="text" id="pp-name" placeholder="e.g. Anna Nagar flat" /></div>
    <div class="field"><label>Renter's name</label><input type="text" id="pp-renter" placeholder="e.g. Suresh Kumar" /></div>
    <div class="field"><label>Deposit paid</label><input type="number" id="pp-deposit" placeholder="0" /></div>
    <div class="field"><label>Monthly rent</label><input type="number" id="pp-rent" placeholder="0" /></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary btn-block" onclick="submitAddProperty()">Save</button>
    </div>`;
  openModal();
}

async function submitAddProperty() {
  const name = document.getElementById('pp-name').value;
  const renterName = document.getElementById('pp-renter').value;
  const deposit = document.getElementById('pp-deposit').value;
  const monthlyRent = document.getElementById('pp-rent').value;
  if (!name || !monthlyRent) { toast('Name and monthly rent are required'); return; }
  try {
    await api('addProperty', { name, renterName, deposit, monthlyRent });
    closeModal();
    toast('Property added');
    renderProperties();
  } catch (e) {
    toast(e.message);
  }
}

function openEditPropertyModal(id) {
  const p = state.properties.find(x => x.ID === id);
  if (!p) return;
  document.getElementById('modal-title').textContent = 'Edit ' + p.Name;
  document.getElementById('modal-body').innerHTML = `
    <div class="field"><label>Property name</label><input type="text" id="pp-name" value="${p.Name}" /></div>
    <div class="field"><label>Renter's name</label><input type="text" id="pp-renter" value="${p.RenterName}" /></div>
    <div class="field"><label>Deposit paid</label><input type="number" id="pp-deposit" value="${p.Deposit}" /></div>
    <div class="field"><label>Monthly rent</label><input type="number" id="pp-rent" value="${p.MonthlyRent}" /></div>
    <div class="modal-actions">
      <button class="btn btn-outline btn-block" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary btn-block" onclick="submitEditProperty('${id}')">Save changes</button>
    </div>`;
  openModal();
}

async function submitEditProperty(id) {
  const name = document.getElementById('pp-name').value;
  const renterName = document.getElementById('pp-renter').value;
  const deposit = document.getElementById('pp-deposit').value;
  const monthlyRent = document.getElementById('pp-rent').value;
  try {
    await api('updateProperty', { id, name, renterName, deposit, monthlyRent });
    closeModal();
    toast('Property updated');
    renderProperties();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- delete ----------
async function deleteEntry(sheetName, id, refreshTab) {
  if (!confirm('Delete this entry?')) return;
  try {
    await api('deleteEntry', { sheet: sheetName, id });
    toast('Deleted');
    if (refreshTab === 'income') renderIncome();
    else if (refreshTab === 'expenses') renderExpenses();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- modal ----------
function openModal() { document.getElementById('modal-backdrop').classList.add('open'); }
function closeModal() { document.getElementById('modal-backdrop').classList.remove('open'); }

// ---------- init ----------
window.addEventListener('DOMContentLoaded', async () => {
  initLogin();
  document.getElementById('month-label').textContent = monthLabel(state.month);
  document.getElementById('prev-month').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => shiftMonth(1));
  document.querySelectorAll('nav.bottom-nav button').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  if (SCRIPT_URL.indexOf('PASTE_YOUR') !== -1) {
    document.getElementById('login-error').textContent = 'Backend not configured yet — set SCRIPT_URL in config.js';
    return;
  }

  const ok = await silentLogin();
  if (ok) enterApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
