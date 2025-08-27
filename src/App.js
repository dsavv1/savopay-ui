import React, { useEffect, useState } from "react";
import StatusPill from "./components/StatusPill";
import AdminPanel from "./components/AdminPanel";

// Build tag so we can verify the UI is fresh after deploy
const BUILD_TAG = "UI build: 2025-08-22 14:10";

// Change this if your backend runs elsewhere
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

export default function App() {
  const [view, setView] = useState("pos"); // "pos" | "admin"

  const [amount, setAmount] = useState("25.00");
  const [invoiceCurrency, setInvoiceCurrency] = useState("USD");
  const [cryptoCurrency, setCryptoCurrency] = useState("USDT");
  const [payerId, setPayerId] = useState("walk-in");
  const [customerEmail, setCustomerEmail] = useState("");

  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState(null);
  const [error, setError] = useState("");

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Inline email UI state
  const [emailTargetId, setEmailTargetId] = useState(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  async function fetchPayments() {
    try {
      setLoadingPayments(true);
      const r = await fetch(`${API_BASE}/payments`);
      const data = await r.json();
      setPayments(Array.isArray(data) ? data : []);
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
        invoice_amount: amount,
        invoice_currency: invoiceCurrency,
        currency: cryptoCurrency,
        payer_id: payerId || "walk-in",
      };
      if (customerEmail.trim()) body.customer_email = customerEmail.trim();

      const resp = await fetch(`${API_BASE}/start-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await resp.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      if (!resp.ok) {
        throw new Error(
          (json && (json.error || json.detail)) || `HTTP ${resp.status}`
        );
      }

      setStartResult(json);
      fetchPayments();
    } catch (e) {
      console.error("handleStartPayment error:", e);
      setError(String(e.message || e));
    } finally {
      setStarting(false);
    }
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
    if (!emailAddress.trim()) {
      alert("Please enter an email address.");
      return;
    }
    try {
      setSendingEmail(true);
      const r = await fetch(`${API_BASE}/payments/${emailTargetId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: emailAddress.trim() }),
      });

      const raw = await r.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (!r.ok) {
        const msg =
          data?.error ||
          data?.detail ||
          `HTTP ${r.status}: ${String(raw).slice(0, 140)}`;
        throw new Error(msg);
      }

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
      const r = await fetch(`${API_BASE}/payments/${paymentId}/recheck`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to re-check");
      alert(
        `Status: ${data.state || "unknown"}${
          data.confirmed ? " (confirmed)" : ""
        }`
      );
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

  return (
    <div style={styles.wrap}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h1 style={styles.h1}>SavoPay POS (Sandbox)</h1>
          <div style={{ color: "#6b7280", margin: "0 0 8px 0", fontSize: 12 }}>
            {BUILD_TAG}
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...styles.secondaryBtn, ...(view === "pos" ? styles.primaryBtn : {}) }}
            onClick={() => setView("pos")}
          >
            POS
          </button>
          <button
            style={{ ...styles.secondaryBtn, ...(view === "admin" ? styles.primaryBtn : {}) }}
            onClick={() => setView("admin")}
          >
            Admin
          </button>
        </nav>
      </header>

      {view === "admin" ? (
        <AdminPanel apiBase={API_BASE} styles={styles} />
      ) : (
        <>
          <form onSubmit={handleStartPayment} style={styles.card}>
            <div style={styles.row}>
              <label style={styles.label}>Amount</label>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
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
              <label style={styles.label}>Customer email (optional)</label>
              <input
                style={styles.input}
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="submit" style={styles.primaryBtn} disabled={starting}>
                {starting ? "Creating..." : "Charge"}
              </button>

              {startResult?.access_url && (
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={openCheckout}
                >
                  Open checkout
                </button>
              )}
            </div>

            {error && <div style={styles.error}>⚠️ {error}</div>}

            {startResult && (
              <div style={styles.resultBox}>
                <div>
                  <b>Payment ID:</b> {startResult.payment_id}
                </div>
                <div>
                  <b>Checkout URL:</b>{" "}
                  <a
                    href={startResult.access_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {startResult.access_url}
                  </a>
                </div>
              </div>
            )}
          </form>

          {/* Date range report (opens endpoints in new tab with browser auth prompt) */}
          <section style={styles.card}>
            <h2 style={styles.h2}>Date range report</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={styles.input}
                type="date"
                id="rangeFrom"
                defaultValue={new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
              />
              <span>to</span>
              <input
                style={styles.input}
                type="date"
                id="rangeTo"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
              <button
                type="button"
                onClick={() => {
                  const from = document.getElementById("rangeFrom").value;
                  const to = document.getElementById("rangeTo").value;
                  window.open(`${API_BASE}/report/range?from=${from}&to=${to}`, "_blank");
                }}
                style={styles.secondaryBtn}
              >
                View JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  const from = document.getElementById("rangeFrom").value;
                  const to = document.getElementById("rangeTo").value;
                  window.open(`${API_BASE}/report/range.csv?from=${from}&to=${to}`, "_blank");
                }}
                style={styles.secondaryBtn}
              >
                Download CSV
              </button>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.listHeader}>
              <h2 style={styles.h2}>Recent payments</h2>
              <button
                onClick={fetchPayments}
                style={styles.secondaryBtn}
                disabled={loadingPayments}
              >
                {loadingPayments ? "Refreshing..." : "Refresh"}
              </button>
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
                    <th>Customer email</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "#666" }}>
                        No payments yet.
                      </td>
                    </tr>
                  )}
                  {payments.map((row) => {
                    const isConfirmed =
                      String(row.state || row.status).toLowerCase() === "confirmed";
                    return (
                      <React.Fragment
                        key={row.payment_id || row.created_at || Math.random()}
                      >
                        <tr>
                          <td>{row.created_at || "—"}</td>
                          <td>{row.order_id || "—"}</td>
                          <td>
                            {row.invoice_amount
                              ? `${row.invoice_amount} ${row.invoice_currency}`
                              : "—"}
                          </td>
                          <td>
                            {row.crypto_amount
                              ? `${row.crypto_amount} ${row.currency}`
                              : "—"}
                          </td>
                          <td>
                            <StatusPill status={row.state || row.status} />
                          </td>
                          <td>{row.customer_email || "—"}</td>
                          <td>
                            <button
                              onClick={() => openEmailForm(row)}
                              disabled={!row?.payment_id || !isConfirmed}
                              style={styles.smallBtn}
                              title={
                                !row?.payment_id
                                  ? "Unavailable"
                                  : !isConfirmed
                                  ? "Available after confirmation"
                                  : "Send receipt"
                              }
                              data-testid="email-btn"
                            >
                              Email receipt
                            </button>{" "}
                            {row?.payment_id && (
                              <a
                                href={`${API_BASE}/receipt/${row.payment_id}/print`}
                                target="_blank"
                                rel="noreferrer"
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
                            </button>
                          </td>
                        </tr>

                        {emailTargetId === row.payment_id && (
                          <tr>
                            <td colSpan={7}>
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
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    maxWidth: 920,
    margin: "24px auto",
    padding: "0 16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial",
  },
  h1: { margin: "0 0 8px 0", fontSize: 28 },
  h2: { margin: "0", fontSize: 20 },
  card: {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  row: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12 },
  label: { width: 160, color: "#111", fontWeight: 600 },
  input: {
    flex: 1,
    minWidth: 200,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
  },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryBtn: {
    display: "inline-block",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #111",
    background: "#fff",
    color: "#111",
    cursor: "pointer",
  },
  smallBtn: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  linkBtn: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #111",
    textDecoration: "none",
    color: "#111",
  },
  error: { marginTop: 12, color: "#b91c1c", fontWeight: 600 },
  resultBox: {
    marginTop: 12,
    padding: 12,
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
  },
  listHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  table: { width: "100%", borderCollapse: "collapse" },
};
