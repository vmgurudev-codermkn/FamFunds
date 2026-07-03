/**
 * FamFunds backend — Google Apps Script Web App
 * ------------------------------------------------
 * This script turns a Google Sheet into a tiny JSON API that the
 * FamFunds website (hosted on GitHub Pages) talks to.
 *
 * SETUP (see README.md for full walkthrough):
 * 1. Create a Google Sheet. Open Extensions > Apps Script.
 * 2. Paste this whole file in as Code.gs.
 * 3. Run `setup` once (from the function dropdown) to create the tabs
 *    and set your PIN. Approve the permissions it asks for.
 * 4. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL into the frontend's config.js as SCRIPT_URL.
 */

// ---------- CONFIG ----------
var EXPENSE_CATEGORIES = ['Groceries', 'Electricity Bill', 'LPG Cylinder', 'Milk', 'Non-veg', 'Laundry', 'Fuel', 'Restaurants', 'Miscellaneous'];

var SHEETS = {
  PROPERTIES: 'Properties',
  RENT: 'RentPayments',
  INTEREST: 'Interest',
  OTHERS: 'Others',
  EXPENSES: 'Expenses'
};

var HEADERS = {
  Properties: ['ID', 'Name', 'RenterName', 'Deposit', 'MonthlyRent', 'Active'],
  RentPayments: ['ID', 'PropertyID', 'PropertyName', 'RenterName', 'Month', 'AmountDue', 'AmountPaid', 'Status', 'DatePaid', 'Notes'],
  Interest: ['ID', 'Date', 'Description', 'Amount', 'Month'],
  Others: ['ID', 'Date', 'Description', 'Amount', 'Month'],
  Expenses: ['ID', 'Date', 'Category', 'Description', 'Amount', 'Month']
};

// ---------- ONE-TIME SETUP ----------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS[name].length);
    headerRange.setValues([HEADERS[name]]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  });
  // remove default "Sheet1" if empty and unused
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // Set a default PIN if none exists yet — CHANGE THIS after running setup.
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_PIN')) props.setProperty('APP_PIN', '1234');

  Logger.log('Setup complete. Default PIN is 1234 — change it with setPin("yourPin").');
}

// Helper to change the PIN from the Apps Script editor: run setPin('7421')
function setPin(newPin) {
  PropertiesService.getScriptProperties().setProperty('APP_PIN', String(newPin));
  Logger.log('PIN updated.');
}

// ---------- ENTRY POINT ----------
function doGet(e) {
  var action = e.parameter.action || '';
  var out;
  try {
    if (action === 'login') {
      out = { ok: checkPin_(e.parameter.pin) };
    } else if (!checkPin_(e.parameter.pin)) {
      out = { ok: false, error: 'Invalid PIN' };
    } else {
      out = route_(action, e.parameter);
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, p) {
  switch (action) {
    case 'dashboard': return { ok: true, data: getDashboard_(p.month) };
    case 'properties': return { ok: true, data: getProperties_() };
    case 'addProperty': return { ok: true, data: addProperty_(p) };
    case 'updateProperty': return { ok: true, data: updateProperty_(p) };
    case 'rent': return { ok: true, data: getRentForMonth_(p.month) };
    case 'markRentPaid': return { ok: true, data: markRentPaid_(p) };
    case 'addInterest': return { ok: true, data: addLedgerEntry_(SHEETS.INTEREST, p) };
    case 'addOther': return { ok: true, data: addLedgerEntry_(SHEETS.OTHERS, p) };
    case 'addExpense': return { ok: true, data: addExpense_(p) };
    case 'incomeList': return { ok: true, data: getIncomeList_(p.month) };
    case 'expenseList': return { ok: true, data: getExpenseList_(p.month) };
    case 'deleteEntry': return { ok: true, data: deleteEntry_(p.sheet, p.id) };
    case 'categories': return { ok: true, data: EXPENSE_CATEGORIES };
    default: return { ok: false, error: 'Unknown action: ' + action };
  }
}

// ---------- AUTH ----------
function checkPin_(pin) {
  var real = PropertiesService.getScriptProperties().getProperty('APP_PIN');
  return !!pin && String(pin) === String(real);
}

// ---------- UTIL ----------
function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function newId_() {
  return Utilities.getUuid().slice(0, 8);
}

function currentMonth_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM');
}

function rowsToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = row[j];
    obj._row = i + 1; // 1-indexed sheet row, useful for updates
    out.push(obj);
  }
  return out;
}

// ---------- PROPERTIES ----------
function getProperties_() {
  return rowsToObjects_(sheet_(SHEETS.PROPERTIES)).filter(function (r) { return r.Active !== false && r.Active !== 'No'; });
}

function addProperty_(p) {
  var sh = sheet_(SHEETS.PROPERTIES);
  var id = newId_();
  sh.appendRow([id, p.name, p.renterName, Number(p.deposit) || 0, Number(p.monthlyRent) || 0, true]);
  return { id: id };
}

function updateProperty_(p) {
  var sh = sheet_(SHEETS.PROPERTIES);
  var rows = rowsToObjects_(sh);
  var target = rows.filter(function (r) { return r.ID === p.id; })[0];
  if (!target) throw new Error('Property not found');
  var row = target._row;
  if (p.name !== undefined) sh.getRange(row, 2).setValue(p.name);
  if (p.renterName !== undefined) sh.getRange(row, 3).setValue(p.renterName);
  if (p.deposit !== undefined) sh.getRange(row, 4).setValue(Number(p.deposit));
  if (p.monthlyRent !== undefined) sh.getRange(row, 5).setValue(Number(p.monthlyRent));
  if (p.active !== undefined) sh.getRange(row, 6).setValue(p.active === 'true' || p.active === true);
  return { id: p.id };
}

// ---------- RENT ----------
// Ensures a RentPayments row exists for every active property for the given month.
function ensureMonthRent_(month) {
  var props = getProperties_();
  var rentSheet = sheet_(SHEETS.RENT);
  var existing = rowsToObjects_(rentSheet).filter(function (r) { return r.Month === month; });
  var existingPropIds = existing.map(function (r) { return r.PropertyID; });
  props.forEach(function (prop) {
    if (existingPropIds.indexOf(prop.ID) === -1) {
      rentSheet.appendRow([newId_(), prop.ID, prop.Name, prop.RenterName, month, Number(prop.MonthlyRent) || 0, 0, 'Pending', '', '']);
    }
  });
}

function getRentForMonth_(month) {
  month = month || currentMonth_();
  ensureMonthRent_(month);
  return rowsToObjects_(sheet_(SHEETS.RENT)).filter(function (r) { return r.Month === month; });
}

function markRentPaid_(p) {
  var sh = sheet_(SHEETS.RENT);
  var rows = rowsToObjects_(sh);
  var target = rows.filter(function (r) { return r.ID === p.id; })[0];
  if (!target) throw new Error('Rent record not found');
  var row = target._row;
  var amountPaid = Number(p.amountPaid);
  var due = Number(target.AmountDue);
  var status = amountPaid >= due ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Pending');
  sh.getRange(row, 7).setValue(amountPaid); // AmountPaid
  sh.getRange(row, 8).setValue(status);     // Status
  sh.getRange(row, 9).setValue(p.datePaid || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd'));
  if (p.notes !== undefined) sh.getRange(row, 10).setValue(p.notes);
  return { id: p.id, status: status };
}

// ---------- INTEREST / OTHERS (simple ledger entries) ----------
function addLedgerEntry_(sheetName, p) {
  var sh = sheet_(sheetName);
  var id = newId_();
  var date = p.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
  var month = date.slice(0, 7);
  sh.appendRow([id, date, p.description || '', Number(p.amount) || 0, month]);
  return { id: id };
}

function getIncomeList_(month) {
  month = month || currentMonth_();
  var interest = rowsToObjects_(sheet_(SHEETS.INTEREST)).filter(function (r) { return r.Month === month; }).map(function (r) { r.Type = 'Interest'; return r; });
  var others = rowsToObjects_(sheet_(SHEETS.OTHERS)).filter(function (r) { return r.Month === month; }).map(function (r) { r.Type = 'Others'; return r; });
  return interest.concat(others).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; });
}

// ---------- EXPENSES ----------
function addExpense_(p) {
  var sh = sheet_(SHEETS.EXPENSES);
  var id = newId_();
  var date = p.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
  var month = date.slice(0, 7);
  var category = EXPENSE_CATEGORIES.indexOf(p.category) !== -1 ? p.category : 'Miscellaneous';
  sh.appendRow([id, date, category, p.description || '', Number(p.amount) || 0, month]);
  return { id: id };
}

function getExpenseList_(month) {
  month = month || currentMonth_();
  return rowsToObjects_(sheet_(SHEETS.EXPENSES)).filter(function (r) { return r.Month === month; }).sort(function (a, b) { return a.Date < b.Date ? 1 : -1; });
}

// ---------- GENERIC DELETE ----------
function deleteEntry_(sheetName, id) {
  var validSheets = [SHEETS.INTEREST, SHEETS.OTHERS, SHEETS.EXPENSES, SHEETS.RENT];
  if (validSheets.indexOf(sheetName) === -1) throw new Error('Cannot delete from that sheet');
  var sh = sheet_(sheetName);
  var rows = rowsToObjects_(sh);
  var target = rows.filter(function (r) { return r.ID === id; })[0];
  if (!target) throw new Error('Entry not found');
  sh.deleteRow(target._row);
  return { id: id, deleted: true };
}

// ---------- DASHBOARD ----------
function getDashboard_(month) {
  month = month || currentMonth_();

  var rent = getRentForMonth_(month);
  var rentPaidTotal = rent.reduce(function (sum, r) { return sum + (Number(r.AmountPaid) || 0); }, 0);
  var pendingRents = rent.filter(function (r) { return r.Status !== 'Paid'; }).map(function (r) {
    return {
      id: r.ID,
      propertyName: r.PropertyName,
      renterName: r.RenterName,
      amountDue: Number(r.AmountDue) - (Number(r.AmountPaid) || 0),
      status: r.Status
    };
  });

  var interest = rowsToObjects_(sheet_(SHEETS.INTEREST)).filter(function (r) { return r.Month === month; });
  var interestTotal = interest.reduce(function (sum, r) { return sum + (Number(r.Amount) || 0); }, 0);

  var others = rowsToObjects_(sheet_(SHEETS.OTHERS)).filter(function (r) { return r.Month === month; });
  var othersTotal = others.reduce(function (sum, r) { return sum + (Number(r.Amount) || 0); }, 0);

  var expenses = rowsToObjects_(sheet_(SHEETS.EXPENSES)).filter(function (r) { return r.Month === month; });
  var byCategory = {};
  EXPENSE_CATEGORIES.forEach(function (c) { byCategory[c] = 0; });
  expenses.forEach(function (r) { byCategory[r.Category] = (byCategory[r.Category] || 0) + (Number(r.Amount) || 0); });
  var expenseTotal = expenses.reduce(function (sum, r) { return sum + (Number(r.Amount) || 0); }, 0);

  var incomeTotal = rentPaidTotal + interestTotal + othersTotal;

  return {
    month: month,
    income: { rent: rentPaidTotal, interest: interestTotal, others: othersTotal, total: incomeTotal },
    expenses: { byCategory: byCategory, total: expenseTotal },
    net: incomeTotal - expenseTotal,
    pendingRents: pendingRents
  };
}
