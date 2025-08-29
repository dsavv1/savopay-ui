// src/App.js
import React, { useEffect, useState, useRef } from "react";
import StatusPill from "./components/StatusPill";
import AdminPanel from "./components/AdminPanel";

const BUILD_TAG = "UI build: 2025-08-29 18:25";
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

export default function App() {
  // Saved prefs
  const [invoiceCurrency, setInvoiceCurrency] = useState(() => localStorage.getItem("fiat") || "USD");
  const [cryptoCurrency, setCryptoCurrency] = useState(() => localStorage.getItem("crypto") || "USDT");
  const [tipPct, setTipPct] = useState(() => {
    const v = parseInt(localStorage.getItem("tipPct") || "0", 10);
    return Number.isFinite(v) ? v : 0;
  });
  const [cashier, setCashier] = useState(() => localStorage.getItem("cashier") || "");
  const [beepOn, setBeepOn] = useState(() => (localStorage.getItem("beepOn") !== "0"));

  useEffect(() => { localStorage.setItem("fiat", invoiceCurrency); }, [invoiceCurrency]);
  useEffect(() => { localStorage.setItem("crypto", cryptoCurrency); }, [cryptoCurrency]);
  useEffect(() => { localStorage.setItem("tipPct", String(tipPct)); }, [tipPct]);
  useEffect(() => { localStorage.setItem("cashier", cashier); }, [cashier]);
  useEffect(() => { localStorage.setItem("beepOn", beepOn ? "1" : "0"); }, [beepOn]);

  // Charge form
  const [amount, setAmount] = useState("25.00");
  const [payerId, setPayerId] = useState("walk-in");
  const [customerEmail, setCustomerEmail] = useState("");

  const base = safeNum(amount);
  const tipAmount = round2((base * tipPct) / 100);
  const totalAmount = round2(base + tipAmount);

  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState(null);
  const [error, setError] = useState("");

  // Data
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Email inline UI
  const [emailTargetId, setEmailTargetId] = useState(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Admin + filters
  const [showAdmin, setShowAdmin] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all"); // all|created|waiting|confirmed|cancelled
  const [searchTerm, setSearchTerm] = useState("");

  // New confirmations alerting
  const prevConfirmedRef = useRef(new Set());

  async function fetchPayments() {
    try {
      setLoadingPayments(true);
      const r = await fetch(`${API_BASE}/payments`);
      const data = await r.json();
      setPayments(Array.isArray(data) ? data : []);
      // Alert on first-seen confirmations
      const prev = prevConfirmedRef.current;
      const nowConfirmed = (Array.isArray(data) ? data : []).filter(isConfirmedRow);
      for (const row of nowConfirmed) {
        const id = row.payment_id || row.order_id || JSON.stringify(row).slice(0, 40);
        if (!prev.has(id)) {
          prev.add(id);
          notify("Payment confirmed", `ID: ${row.payment_id || "—"} • ${row.invoice_amount || ""} ${row.invoice_currency || ""}`);
          if (beepOn) beep();
        }
      }
    } catch (e) {
      console.error("fetchPayments error:", e);
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    fetchPayments();
    const t = setInterval(fetchPayments, 5000);
    return () => clearInterval(t);
  }, []);

  async function handleStartPayment(e) {
    e.preventDefault();
    setError("");
    setStartResult(null);
    setStarting(true);
    try {
      const body = {
        invoice_amount: totalAmount.toFixed(2),
        invoice_currency: invoiceCurrency,
        currency: cryptoCurrency,
        payer_id: payerId || "walk-in",
        meta_tip_percent: tipPct,
        meta_tip_amount: tipAmount.toFixed(2),
        meta_base_amount: base.toFixed(2),
        meta_cashier: cashier || null,
      };
      if (customerEmail.trim()) body.customer_email = customerEmail.trim();

      const resp = await fetch(`${API_BASE}/start-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await resp.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!resp.ok) throw new Error((json && (json.error || json.detail)) || `HTTP ${resp.status}`);

      setStartResult(json);
      fetchPayments();
    } catch (e) {
      console.error("handleStartPayment error:", e);
      setError(String(e.message || e));
    } finally {
      setStarting(false);
    }
  }

  function resetForm() {
    setAmount("25.00");
    setTipPct(0);
    setPayerId("walk-in");
    setCustomerEmail("");
    setStartResult(null);
    setError("");
  }

  function openEmailForm(row) {
    setEmailTargetId(row.payment_id);
    setEmailAddress(row.customer_email || customerEmail || "");
  }
  function cancelEmailForm() {
    setEmailTargetId(null);
    setEmailAddress("");
  }

  async function sendEmail() {
    if (!emailTargetId) return;
    if (!emailAddress.trim()) { alert("Please enter an email address."); return; }
    try {
      setSendingEmail(true);
      const r = await fetch(`${API_BASE}/payments/${emailTargetId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: emailAddress.trim() }),
      });
      const raw = await r.text();
      let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (!r.ok) throw new Error(data?.error || data?.detail || `HTTP ${r.status}: ${String(raw).slice(0, 140)}`);
      alert(`Receipt sent to ${emailAddress.trim()}`);
      cancelEmailForm();
    } catch (e) {
      console.error("sendEmail error:", e);
      alert(`Failed to send: ${e.message || e}`);
    } finally {
      setSendingEmail(false);
    }
  }

  async function recheck(paymentId) {
    try {
      const r = await fetch(`${API_BASE}/payments/${paymentId}/recheck`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to re-check");
      alert(`Status: ${data.state || "unknown"}${data.confirmed ? " (confirmed)" : ""}`);
      fetchPayments();
    } catch (e) {
      console.error("recheck error:", e);
      alert(`Re-check failed: ${e.message || e}`);
    }
  }

  function openCheckout() {
    const url = startResult?.access_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  // Filters + search
  const filteredPayments = payments.filter((row) => {
    const status = String(row.state || row.status || "").toLowerCase();
    if (filterStatus !== "all" && status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const hay = [row.payment_id, row.order_id, row.customer_email, row.payer_id, row.meta_cashier]
        .map((s) => String(s || "").toLowerCase())
        .join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const confirmedCount = payments.filter(isConfirmedRow).length;
  const totalCount = payments.length;

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>SavoPay POS (Sandbox)</h1>
          <div style={{ color: "#6b7280", margin: "0 0 12px 0", fontSize: 12 }}>{BUILD_TAG}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={styles.secondaryBtn} onClick={() => setBeepOn(b => !b)}>
            {beepOn ? "Sound: On" : "Sound: Off"}
          </button>
          <button style={styles.secondaryBtn} onClick={requestNotify}>
            Enable alerts
          </button>
          <button style={styles.secondaryBtn} onClick={resetForm}>
            New sale
          </button>
          <button style={styles.secondaryBtn} onClick={() => setShowAdmin(s => !s)}>
            {showAdmin ? "Close Admin" : "Open Admin"}
          </button>
        </div>
      </div>

      {showAdmin && (
        <section style={styles.card}>
          <AdminPanel apiBase={API_BASE} />
        </section>
      )}

      {/* Charge form */}
      <form onSubmit={handleStartPayment} style={styles.card}>
        <div style={styles.row}>
          <label style={styles.label}>Amount (before tip)</label>
          <div style={{ flex: 1 }}>
            <input
              style={styles.input}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <div style={{ margin: "8px 0 4px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["5.00", "10.00", "20.00", "50.00"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
                >
                  {Number(v).toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...styles.row, alignItems: "flex-start" }}>
          <label style={styles.label}>Tip</label>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {[0, 10, 15, 20].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTipPct(p)}
                  style={{ ...styles.segmentBtn, ...(tipPct === p ? styles.segmentBtnActive : {}) }}
                >
                  {p}%
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#374151" }}>
              Tip: <b>{fmt(tipAmount, invoiceCurrency)}</b> ({tipPct}%)
              {"  "}•{"  "}
              Total: <b>{fmt(totalAmount, invoiceCurrency)}</b>
            </div>
          </div>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Fiat currency</label>
          <select
            style={styles.input}
            value={invoiceCurrency}
            onChange={(e) => setInvoiceCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Crypto to receive</label>
          <select
            style={styles.input}
            value={cryptoCurrency}
            onChange={(e) => setCryptoCurrency(e.target.value)}
          >
            <option value="USDT">USDT (ERC20)</option>
          </select>
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Payer ID</label>
          <input
            style={styles.input}
            type="text"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            placeholder="walk-in"
          />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Cashier name</label>
          <input
            style={styles.input}
            type="text"
            value={cashier}
            onChange={(e) => setCashier(e.target.value)}
            placeholder="Cashier"
          />
        </div>

        <div style={styles.row}>
          <label style={styles.label}>Customer email (optional)</label>
          <input
            style={styles.input}
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" style={styles.primaryBtn} disabled={starting}>
            {starting ? "Creating..." : `Charge ${fmt(totalAmount, invoiceCurrency)}`}
          </button>

          {startResult?.access_url && (
            <button type="button" style={styles.secondaryBtn} onClick={openCheckout}>
              Open checkout
            </button>
          )}
        </div>

        {error && <div style={styles.error}>⚠️ {error}</div>}

        {startResult && (
          <div style={styles.resultBox}>
            <div><b>Payment ID:</b> {startResult.payment_id}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <b>Checkout URL:</b>{" "}
                <a href={startResult.access_url} target="_blank" rel="noreferrer">
                  {startResult.access_url}
                </a>
              </div>
              <button
                type="button"
                style={styles.secondaryBtn}
                onClick={() => copyToClipboard(startResult.access_url)}
              >
                Copy checkout link
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Payments list */}
      <section style={styles.card}>
        <div style={styles.listHeader}>
          <h2 style={styles.h2}>Recent payments</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={fetchPayments} style={styles.secondaryBtn} disabled={loadingPayments}>
              {loadingPayments ? "Refreshing..." : "Refresh"}
            </button>
            <span style={styles.statText}>
              Confirmed: <b>{confirmedCount}</b> • Total: <b>{totalCount}</b>
            </span>
          </div>
        </div>

        <div style={styles.controlsRow}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontWeight: 600 }}>Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={styles.input}
            >
              <option value="all">All</option>
              <option value="created">Created</option>
              <option value="waiting">Waiting</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontWeight: 600 }}>Search</label>
            <input
              style={styles.input}
              type="text"
              placeholder="payment id, order id, email, cashier…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Created</th>
                <th>Order ID</th>
                <th>Fiat</th>
                <th>Crypto</th>
                <th>Status</th>
                <th>Cashier</th>
                <th>Tip</th>
                <th>Customer email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "#666" }}>
                    No matching payments.
                  </td>
                </tr>
              )}
              {filteredPayments.map((row) => {
                const state = String(row.state || row.status || "").toLowerCase();
                const isConfirmed = state === "confirmed";
                const tipText = fixed2(row.meta_tip_amount)
                  ? `${fixed2(row.meta_tip_amount)} ${row.invoice_currency}${row.meta_tip_percent != null ? ` (${row.meta_tip_percent}%)` : ""}`
                  : "—";

                return (
                  <React.Fragment key={row.payment_id || row.created_at || Math.random()}>
                    <tr style={isConfirmed ? styles.rowConfirmed : undefined}>
                      <td>{row.created_at || "—"}</td>
                      <td>{row.order_id || "—"}</td>
                      <td>{row.invoice_amount ? `${row.invoice_amount} ${row.invoice_currency}` : "—"}</td>
                      <td>{row.crypto_amount ? `${row.crypto_amount} ${row.currency}` : "—"}</td>
                      <td><StatusPill status={row.state || row.status || "—"} /></td>
                      <td>{row.meta_cashier || "—"}</td>
                      <td>{tipText}</td>
                      <td>{row.customer_email || "—"}</td>
                      <td>
                        <button
                          onClick={() => openEmailForm(row)}
                          disabled={!row?.payment_id || !isConfirmed}
                          title={!row?.payment_id ? "Unavailable" : !isConfirmed ? "Available after confirmation" : "Send receipt"}
                          style={styles.smallBtn}
                          data-testid="email-btn"
                        >
                          Email
                        </button>{" "}
                        {row?.payment_id && (
                          <a
                            href={`${API_BASE}/receipt/${encodeURIComponent(row.payment_id)}/print`}
                            target="_blank"
                            rel="noreferrer noopener"
                            style={styles.linkBtn}
                          >
                            Print
                          </a>
                        )}{" "}
                        <button
                          onClick={() => recheck(row.payment_id)}
                          disabled={!row?.payment_id}
                          style={styles.smallBtn}
                          title="Re-check status with ForumPay"
                          data-testid="recheck-btn"
                        >
                          Re-check
                        </button>{" "}
                        {row?.payment_id && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${API_BASE}/receipt/${encodeURIComponent(row.payment_id)}/print`)}
                            style={styles.smallBtn}
                            title="Copy receipt link"
                          >
                            Copy receipt
                          </button>
                        )}{" "}
                        {row?.payment_id && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(row.payment_id)}
                            style={styles.smallBtn}
                            title="Copy payment ID"
                          >
                            Copy ID
                          </button>
                        )}
                      </td>
                    </tr>

                    {emailTargetId === row.payment_id && (
                      <tr>
                        <td colSpan={9}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              style={{ ...styles.input, maxWidth: 360 }}
                              type="email"
                              placeholder="name@example.com"
                              value={emailAddress}
                              onChange={(e) => setEmailAddress(e.target.value)}
                              data-testid="email-input"
                            />
                            <button
                              type="button"
                              onClick={sendEmail}
                              disabled={sendingEmail || !emailAddress.trim()}
                              style={styles.smallBtn}
                              data-testid="email-send"
                            >
                              {sendingEmail ? "Sending..." : "Send"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEmailForm}
                              style={styles.secondaryBtn}
                              data-testid="email-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Daily report */}
      <section style={styles.card}>
        <h2 style={styles.h2}>Daily report</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            style={styles.input}
            type="date"
            id="reportDate"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <button
            type="button"
            onClick={() => {
              const d = document.getElementById("reportDate").value;
              window.open(`${API_BASE}/report/daily?date=${d}`, "_blank");
            }}
            style={styles.secondaryBtn}
          >
            View JSON
          </button>
          <button
            type="button"
            onClick={() => {
              const d = document.getElementById("reportDate").value;
              window.open(`${API_BASE}/report/daily.csv?date=${d}`, "_blank");
            }}
            style={styles.secondaryBtn}
          >
            Download CSV
          </button>
        </div>
      </section>
    </div>
  );
}

/* Helpers */
function safeNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function fmt(n, ccy) {
  const s = Number.isFinite(n) ? n.toFixed(2) : "0.00";
  return `${s} ${ccy}`;
}
function fixed2(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}
function isConfirmedRow(row) {
  return String(row?.state || row?.status || "").toLowerCase() === "confirmed";
}
async function requestNotify() {
  try {
    if (!("Notification" in window)) return alert("Notifications not supported");
    if (Notification.permission === "granted") return alert("Notifications already enabled");
    const p = await Notification.requestPermission();
    alert(p === "granted" ? "Notifications enabled" : "Notifications not enabled");
  } catch {}
}
function notify(title, body) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(title, { body });
  } catch {}
}
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    o.start();
    setTimeout(() => {
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      setTimeout(() => { o.stop(); ctx.close(); }, 180);
    }, 120);
  } catch {}
}
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied to clipboard");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copied to clipboard");
  }
}

/* Styles */
const styles = {
  wrap: { maxWidth: 980, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial" },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  h1: { margin: "0 0 8px 0", fontSize: 28 },
  h2: { margin: "0 0 8px 0", fontSize: 20 },
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  row: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12 },
  label: { width: 170, color: "#111", fontWeight: 600 },
  input: { flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" },
  primaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  secondaryBtn: { display: "inline-block", padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer" },
  smallBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  linkBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #111", textDecoration: "none", color: "#111" },
  error: { marginTop: 12, color: "#b91c1c", fontWeight: 600 },
  resultBox: { marginTop: 12, padding: 12, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8 },
  listHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  controlsRow: { display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" },
  statText: { color: "#374151", fontSize: 13 },
  table: { width: "100%", borderCollapse: "collapse" },
  segmentBtn: { padding: "8px 12px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" },
  segmentBtnActive: { borderColor: "#111", background: "#111", color: "#fff" },
  rowConfirmed: { background: "#f1fdf5" },
};
