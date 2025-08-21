// server.js — SavoPay backend with email receipts + reports + secured webhook (CommonJS)
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.server" });

const {
  upsertPayment,
  upsertReceipt,
  getReceipt,
  isFulfilled,
  recordFulfilled,
  recordEmailAttempt,
  getPayment,
  db,
} = require("./db");

// node-fetch shim for CommonJS (Node 22)
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

const app = express();

// --- Config from .env.server ---
const FORUMPAY_BASE_URL = process.env.FORUMPAY_BASE_URL || "https://sandbox.api.forumpay.com";
const FORUMPAY_USER = process.env.FORUMPAY_USER || process.env.FORUMPAY_API_KEY || "";
const FORUMPAY_SECRET = process.env.FORUMPAY_SECRET || process.env.FORUMPAY_API_SECRET || "";
const FORUMPAY_POS_ID = process.env.FORUMPAY_POS_ID || "savopay-pos-01";
const FORUMPAY_CALLBACK_URL = process.env.FORUMPAY_CALLBACK_URL || "";
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || "";
const PORT = Number(process.env.PORT || 5050);

// Email config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@savopay.local";
const BRAND_NAME = process.env.BRAND_NAME || "SavoPay";

const emailEnabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

// --- Security: CORS allowlist ---
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  /^https:\/\/.*\.trycloudflare\.com$/,
  /^https:\/\/.*\.loca\.lt$/,
];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / Postman / no-origin
      const ok = allowedOrigins.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin));
      return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
    },
  })
);

// Body parsers (built-in — no body-parser package)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Helpers ---
function authHeader() {
  const token = Buffer.from(`${FORUMPAY_USER}:${FORUMPAY_SECRET}`).toString("base64");
  return "Basic " + token;
}
function stripHtml(html) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
}
function withTokenInUrl(baseUrl, token) {
  if (!token) return baseUrl;
  const hasQuery = baseUrl.includes("?");
  const hasToken = /([?&])token=/.test(baseUrl);
  return hasToken ? baseUrl : `${baseUrl}${hasQuery ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

// ---------- Health ----------
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/", (_req, res) => res.send("SavoPay backend server is running 🚀"));

// ---------- StartPayment ----------
app.post("/start-payment", async (req, res) => {
  try {
    const missing = [];
    if (!FORUMPAY_USER && !process.env.FORUMPAY_API_KEY) missing.push("FORUMPAY_USER or FORUMPAY_API_KEY");
    if (!FORUMPAY_SECRET && !process.env.FORUMPAY_API_SECRET) missing.push("FORUMPAY_SECRET or FORUMPAY_API_SECRET");
    if (!FORUMPAY_CALLBACK_URL) missing.push("FORUMPAY_CALLBACK_URL");
    if (missing.length) return res.status(500).json({ error: "Missing env vars", missing });

    const {
      invoice_amount = "100.00",
      invoice_currency = "USD",
      currency = "USDT",
      payer_ip_address = "203.0.113.10",
      payer_id = "walk-in",
      order_id,
      customer_email,
    } = req.body || {};

    const safeOrderId = order_id || `SVP-TEST-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const cbUrl = withTokenInUrl(FORUMPAY_CALLBACK_URL, WEBHOOK_TOKEN); // append token

    const form = new URLSearchParams({
      pos_id: FORUMPAY_POS_ID,
      invoice_amount,
      invoice_currency,
      currency,
      payer_ip_address,
      payer_id,
      order_id: safeOrderId,
      callback_url: cbUrl,
    });

    console.log("Calling StartPayment with:", {
      pos_id: FORUMPAY_POS_ID,
      invoice_amount,
      invoice_currency,
      currency,
      payer_ip_address,
      payer_id,
      order_id: safeOrderId,
      callback_url: cbUrl,
      customer_email,
    });

    const resp = await fetch(`${FORUMPAY_BASE_URL}/pay/v2/StartPayment/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: authHeader() },
      body: form.toString(),
    });

    const text = await resp.text();
    console.log("StartPayment status:", resp.status, "body:", text);

    try {
      const data = JSON.parse(text);
      upsertPayment({
        payment_id: data.payment_id,
        order_id: safeOrderId,
        pos_id: FORUMPAY_POS_ID,
        address: data.address,
        currency: data.currency,
        invoice_amount: data.invoice_amount,
        invoice_currency: data.invoice_currency,
        crypto_amount: data.amount,
        status: "Created",
        state: "created",
        confirmed: false,
        payer_id,
        customer_email: customer_email || null,
      });
      upsertReceipt(data.payment_id, data.print_string);
    } catch (_e) {}

    return res.status(resp.status).send(text);
  } catch (err) {
    console.error("StartPayment error", err);
    return res.status(500).json({ error: "StartPayment failed", detail: String(err) });
  }
});

// ---------- CheckPayment ----------
app.post("/check-payment", async (req, res) => {
  try {
    const { payment_id, currency, address } = req.body || {};
    if (!payment_id || !currency || !address) {
      return res.status(400).json({ error: "payment_id, currency, and address are required" });
    }

    const form = new URLSearchParams({ pos_id: FORUMPAY_POS_ID, payment_id, currency, address });

    const resp = await fetch(`${FORUMPAY_BASE_URL}/pay/v2/CheckPayment/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: authHeader() },
      body: form.toString(),
    });

    const text = await resp.text();
    console.log("CheckPayment status:", resp.status, "body:", text);

    try {
      const data = JSON.parse(text);
      upsertPayment({
        payment_id,
        order_id: data.order_id || null,
        pos_id: FORUMPAY_POS_ID,
        address,
        currency,
        invoice_amount: data.invoice_amount,
        invoice_currency: data.invoice_currency,
        crypto_amount: data.payment || data.amount,
        status: data.status,
        state: data.state,
        confirmed: !!data.confirmed,
        confirmed_time: data.confirmed_time,
        payer_id: data.payer_id,
        customer_email: data.customer_email || null,
      });
      upsertReceipt(payment_id, data.print_string);
    } catch (_e) {}

    return res.status(resp.status).send(text);
  } catch (err) {
    console.error("CheckPayment error", err);
    return res.status(500).json({ error: "CheckPayment failed", detail: String(err) });
  }
});

// ---------- Rate limit the webhook ----------
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 hits / minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/forumpay/callback", webhookLimiter);

// ---------- Webhook (ForumPay -> your server) ----------
app.post("/api/forumpay/callback", async (req, res) => {
  try {
    // Verify shared secret token in querystring
    if (WEBHOOK_TOKEN) {
      const tokenInReq = (req.query && req.query.token) || "";
      if (tokenInReq !== WEBHOOK_TOKEN) {
        console.warn("❌ Webhook token mismatch");
        return res.status(401).send("unauthorized");
      }
    }

    const evt = req.body;
    console.log("💳 ForumPay Callback Received:", JSON.stringify(evt, null, 2));

    const { payment_id, currency, address } = evt || {};
    if (payment_id && currency && address) {
      const form = new URLSearchParams({ pos_id: FORUMPAY_POS_ID, payment_id, currency, address });

      const resp = await fetch(`${FORUMPAY_BASE_URL}/pay/v2/CheckPayment/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: authHeader() },
        body: form.toString(),
      });

      const text = await resp.text();
      console.log("🔎 CheckPayment after webhook:", resp.status, "body:", text);

      try {
        const data = JSON.parse(text);

        // Persist latest state & receipt
        upsertPayment({
          payment_id,
          order_id: data.order_id || null,
          pos_id: FORUMPAY_POS_ID,
          address,
          currency,
          invoice_amount: data.invoice_amount,
          invoice_currency: data.invoice_currency,
          crypto_amount: data.payment || data.amount,
          status: data.status,
          state: data.state,
          confirmed: !!data.confirmed,
          confirmed_time: data.confirmed_time,
          payer_id: data.payer_id,
          customer_email: data.customer_email || null,
        });
        upsertReceipt(payment_id, data.print_string);

        // Fulfil once (DB-backed idempotency)
        const isConfirmed =
          data?.confirmed === true || data?.state === "confirmed" || data?.status === "Confirmed";

        if (isConfirmed && payment_id) {
          if (!isFulfilled(payment_id)) {
            console.log("✅ FULFIL ORDER for", payment_id, {
              order_id: data.order_id,
              fiat: `${data.invoice_amount} ${data.invoice_currency}`,
              crypto: `${data.payment} ${data.currency}`,
              confirmed_time: data.confirmed_time,
            });

            recordFulfilled(payment_id, {
              order_id: data.order_id,
              amount_fiat: { value: data.invoice_amount, currency: data.invoice_currency },
              amount_crypto: { value: data.payment, currency: data.currency },
              confirmed_time: data.confirmed_time,
            });

            // Auto-email if configured and we have customer_email
            const paymentRow = getPayment(payment_id);
            const toEmail = paymentRow?.customer_email;
            if (emailEnabled && toEmail && validateEmail(toEmail)) {
              try {
                await sendReceiptEmail({ payment_id, toEmail });
                console.log("📧 Receipt emailed to", toEmail);
              } catch (e) {
                console.error("Email send failed:", e);
              }
            }
          } else {
            console.log("↩️ already fulfilled (db)", payment_id);
          }
        }
      } catch (e) {
        console.warn("Could not parse CheckPayment JSON:", e);
      }
    } else {
      console.warn("⚠️ Webhook missing fields (need payment_id, currency, address) to CheckPayment.");
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(200).send("ok");
  }
});

// ---------- READ endpoints ----------
app.get("/payments", (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM payments ORDER BY created_at DESC LIMIT 50").all();
    res.json(rows);
  } catch (e) {
    console.error("List payments error:", e);
    res.status(500).json({ error: "Failed to list payments" });
  }
});

app.get("/payments/:payment_id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM payments WHERE payment_id = ?").get(req.params.payment_id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    console.error("Read payment error:", e);
    res.status(500).json({ error: "Failed to read payment" });
  }
});

// Email attempts (debug)
app.get("/email-receipts", (_req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM email_receipts ORDER BY sent_at DESC LIMIT 50").all();
    res.json(rows);
  } catch (e) {
    console.error("List email receipts error:", e);
    res.status(500).json({ error: "Failed to list email receipts" });
  }
});

// Manual (re)send
app.post("/payments/:payment_id/email", async (req, res) => {
  try {
    const { payment_id } = req.params;
    const override = ((req.body && req.body.to_email) || "").trim();
    const pay = getPayment(payment_id);
    if (!pay) return res.status(404).json({ error: "Payment not found" });

    const toEmail = override || pay.customer_email;
    if (!toEmail || !validateEmail(toEmail)) {
      return res.status(400).json({ error: "Valid to_email required" });
    }

    if (!emailEnabled) return res.status(500).json({ error: "Email not configured on server" });

    await sendReceiptEmail({ payment_id, toEmail });
    return res.json({ ok: true, payment_id, to: toEmail });
  } catch (e) {
    console.error("Manual email error:", e);
    return res.status(500).json({ error: "Failed to send email", detail: String(e) });
  }
});

// ---------- Receipt JSON / HTML ----------
app.get("/receipt/:payment_id", (req, res) => {
  try {
    const r = getReceipt(req.params.payment_id);
    if (!r || !r.print_string) return res.status(404).json({ error: "No receipt found" });
    res.json({ payment_id: req.params.payment_id, print_string: r.print_string });
  } catch (e) {
    console.error("Get receipt error:", e);
    res.status(500).json({ error: "Failed to get receipt" });
  }
});

function renderReceiptHTML(printStringRaw) {
  let s = printStringRaw || "";
  s = s.replace(/<BR>/g, "<br/>");
  s = s.replace(/<SMALL>/g, '<span class="small">').replace(/<\/SMALL>/g, "</span>");
  s = s.replace(/<BOLD>/g, "<strong>").replace(/<\/BOLD>/g, "</strong>");
  s = s.replace(/<BIG>/g, '<span class="big">').replace(/<\/BIG>/g, "</span>");
  s = s.replace(/<CENTER>/g, '<div class="center">').replace(/<\/CENTER>/g, "</div>");
  s = s.replace(/<LINE>/g, '<hr class="line"/>');
  s = s.replace(/<DLINE>/g, '<hr class="dline"/>');
  s = s.replace(/<CUT>/g, '<div class="cut"></div>');
  s = s.replace(/<QR>(.*?)<\/QR>/g, (_m, url) => {
    const encoded = encodeURIComponent(url);
    return `
      <div class="center">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}" alt="QR"/>
        <div class="qr-url">${url}</div>
      </div>
    `;
  });

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${BRAND_NAME} Receipt</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Inter, Arial, sans-serif; margin: 16px; }
    .wrap { max-width: 360px; margin: 0 auto; }
    .small { font-size: 12px; color: #333; }
    .big { font-size: 18px; font-weight: 700; }
    .center { text-align: center; }
    .line { border: none; border-top: 1px solid #999; margin: 8px 0; }
    .dline { border: none; border-top: 2px solid #000; margin: 10px 0; }
    .cut { border-top: 1px dashed #999; margin: 16px 0; }
    .qr-url { font-size: 11px; word-break: break-all; margin-top: 6px; color: #444; }
    .actions { margin: 12px 0 18px; text-align: center; }
    button { padding: 8px 12px; border-radius: 6px; border: 1px solid #111; background:#111; color:#fff; cursor:pointer; }
    @media print { .actions { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="actions"><button onclick="window.print()">Print</button></div>
    ${s}
  </div>
  <script> setTimeout(() => { try { window.print(); } catch(e) {} }, 300); </script>
</body>
</html>`;
}

app.get("/receipt/:payment_id/print", (req, res) => {
  try {
    const r = getReceipt(req.params.payment_id);
    if (!r || !r.print_string) return res.status(404).send("<h1>No receipt found</h1>");
    const html = renderReceiptHTML(r.print_string);
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    console.error("Render receipt error:", e);
    res.status(500).send("<h1>Failed to render receipt</h1>");
  }
});

// ---------- Reports ----------
function toISODate(d) {
  return d ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

app.get("/report/daily", (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const fiat = db
      .prepare(
        `SELECT invoice_currency AS currency,
                COUNT(*) AS count,
                ROUND(SUM(CAST(invoice_amount AS REAL)), 2) AS total
         FROM payments
         WHERE state='confirmed' AND date(confirmed_time)=date(?)
         GROUP BY invoice_currency`
      )
      .all(date);

    const crypto = db
      .prepare(
        `SELECT currency,
                COUNT(*) AS count,
                ROUND(SUM(CAST(crypto_amount AS REAL)), 8) AS total
         FROM payments
         WHERE state='confirmed' AND date(confirmed_time)=date(?)
         GROUP BY currency`
      )
      .all(date);

    const rows = db
      .prepare(
        `SELECT created_at, confirmed_time, payment_id, order_id, invoice_amount, invoice_currency,
                crypto_amount, currency, payer_id, customer_email
         FROM payments
         WHERE state='confirmed' AND date(confirmed_time)=date(?)
         ORDER BY confirmed_time ASC`
      )
      .all(date);

    res.json({ date, fiat_totals: fiat, crypto_totals: crypto, rows });
  } catch (e) {
    console.error("Daily report error:", e);
    res.status(500).json({ error: "Failed to build daily report" });
  }
});

app.get("/report/daily.csv", (req, res) => {
  try {
    const date = toISODate(req.query.date);
    const rows = db
      .prepare(
        `SELECT created_at, confirmed_time, payment_id, order_id, invoice_amount, invoice_currency,
                crypto_amount, currency, payer_id, customer_email
         FROM payments
         WHERE state='confirmed' AND date(confirmed_time)=date(?)
         ORDER BY confirmed_time ASC`
      )
      .all(date);

    const header = [
      "created_at",
      "confirmed_time",
      "payment_id",
      "order_id",
      "invoice_amount",
      "invoice_currency",
      "crypto_amount",
      "currency",
      "payer_id",
      "customer_email",
    ];

    const lines = [header.join(",")];
    for (const r of rows) {
      const vals = header.map((k) => {
        const v = r[k] == null ? "" : String(r[k]);
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      });
      lines.push(vals.join(","));
    }

    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sales_${date}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error("Daily report CSV error:", e);
    res.status(500).send("Failed to build CSV");
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
