// db.js (CommonJS) — payments + receipts + fulfilment + email attempts
const Database = require("better-sqlite3");
const db = new Database("payments.db");

db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  payment_id TEXT PRIMARY KEY,
  order_id TEXT,
  pos_id TEXT,
  address TEXT,
  currency TEXT,
  invoice_amount TEXT,
  invoice_currency TEXT,
  crypto_amount TEXT,
  status TEXT,
  state TEXT,
  confirmed INTEGER,
  confirmed_time TEXT,
  payer_id TEXT,
  customer_email TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS receipts (
  payment_id TEXT PRIMARY KEY,
  print_string TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS fulfilments (
  payment_id TEXT PRIMARY KEY,
  fulfilled_at TEXT DEFAULT (datetime('now')),
  payload_json TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS email_receipts (
  payment_id TEXT PRIMARY KEY,
  to_email TEXT,
  status TEXT,             -- 'sent' | 'failed'
  error TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);
`);

// Try to add new columns on older DBs (safe no-op if exists)
try { db.exec(`ALTER TABLE payments ADD COLUMN customer_email TEXT;`); } catch (_e) {}

const upsertPaymentStmt = db.prepare(`
INSERT INTO payments (
  payment_id, order_id, pos_id, address, currency,
  invoice_amount, invoice_currency, crypto_amount,
  status, state, confirmed, confirmed_time, payer_id, customer_email
) VALUES (
  @payment_id, @order_id, @pos_id, @address, @currency,
  @invoice_amount, @invoice_currency, @crypto_amount,
  @status, @state, @confirmed, @confirmed_time, @payer_id, @customer_email
)
ON CONFLICT(payment_id) DO UPDATE SET
  status=excluded.status,
  state=excluded.state,
  confirmed=excluded.confirmed,
  confirmed_time=excluded.confirmed_time,
  crypto_amount=COALESCE(excluded.crypto_amount, payments.crypto_amount),
  invoice_amount=COALESCE(excluded.invoice_amount, payments.invoice_amount),
  invoice_currency=COALESCE(excluded.invoice_currency, payments.invoice_currency),
  address=COALESCE(excluded.address, payments.address),
  currency=COALESCE(excluded.currency, payments.currency),
  order_id=COALESCE(excluded.order_id, payments.order_id),
  customer_email=COALESCE(excluded.customer_email, payments.customer_email)
`);

const upsertReceiptStmt = db.prepare(`
INSERT INTO receipts (payment_id, print_string)
VALUES (@payment_id, @print_string)
ON CONFLICT(payment_id) DO UPDATE SET
  print_string = COALESCE(excluded.print_string, receipts.print_string)
`);

const isFulfilledStmt = db.prepare(`SELECT 1 FROM fulfilments WHERE payment_id = ?`);
const recordFulfilledStmt = db.prepare(`
INSERT OR IGNORE INTO fulfilments (payment_id, payload_json)
VALUES (?, ?)
`);

const setEmailAttemptStmt = db.prepare(`
INSERT INTO email_receipts (payment_id, to_email, status, error)
VALUES (@payment_id, @to_email, @status, @error)
ON CONFLICT(payment_id) DO UPDATE SET
  to_email=excluded.to_email,
  status=excluded.status,
  error=excluded.error,
  sent_at=datetime('now')
`);

const getEmailAttemptStmt = db.prepare(`SELECT * FROM email_receipts WHERE payment_id = ?`);
const getPaymentStmt = db.prepare(`SELECT * FROM payments WHERE payment_id = ?`);

function upsertPayment(p) {
  upsertPaymentStmt.run({
    payment_id: p.payment_id,
    order_id: p.order_id || null,
    pos_id: p.pos_id || "savopay-pos-01",
    address: p.address || null,
    currency: p.currency || null,
    invoice_amount: p.invoice_amount || null,
    invoice_currency: p.invoice_currency || null,
    crypto_amount: p.payment || p.amount || p.crypto_amount || null,
    status: p.status || null,
    state: p.state || null,
    confirmed: p.confirmed ? 1 : 0,
    confirmed_time: p.confirmed_time || null,
    payer_id: p.payer_id || null,
    customer_email: p.customer_email || null,
  });
}

function upsertReceipt(payment_id, print_string) {
  if (!payment_id) return;
  upsertReceiptStmt.run({ payment_id, print_string: print_string || null });
}

function getReceipt(payment_id) {
  return db.prepare("SELECT print_string FROM receipts WHERE payment_id = ?").get(payment_id);
}

function isFulfilled(payment_id) {
  return !!isFulfilledStmt.get(payment_id);
}

function recordFulfilled(payment_id, payload) {
  recordFulfilledStmt.run(payment_id, payload ? JSON.stringify(payload) : null);
}

function recordEmailAttempt({ payment_id, to_email, status, error }) {
  setEmailAttemptStmt.run({
    payment_id,
    to_email: to_email || null,
    status: status || null,
    error: error || null,
  });
}

function getEmailAttempt(payment_id) {
  return getEmailAttemptStmt.get(payment_id);
}

function getPayment(payment_id) {
  return getPaymentStmt.get(payment_id);
}

module.exports = {
  upsertPayment,
  upsertReceipt,
  getReceipt,
  isFulfilled,
  recordFulfilled,
  recordEmailAttempt,
  getEmailAttempt,
  getPayment,
  db,
};
