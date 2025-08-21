import React, { useEffect, useState } from "react";

// Change this if your backend runs elsewhere
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

export default function App() {
  const [amount, setAmount] = useState("25.00");
  const [invoiceCurrency, setInvoiceCurrency] = useState("USD");
  const [cryptoCurrency, setCryptoCurrency] = useState("USDT");
  const [payerId, setPayerId] = useState("walk-in");
  const [customerEmail, setCustomerEmail] = useState("");

  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState(null); // parsed StartPayment JSON
  const [error, setError] = useState("");

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Fetch recent payments (poll every 5s)
  async function fetchPayments() {
    try {
      setLoadingPayments(true);
      const r = await fetch(`${API_BASE}/payments`);
      const data = await r.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    fetchPayments();
    const t = setInterval(fetchPayments, 5000);
    return () => clearInterval(t);
  }, []);

  // Start a sandbox payment via backend
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
        throw new Error((json && json.error) || `HTTP ${resp.status}`);
      }

      setStartResult(json);
      // refresh payments list so the new row shows up
      fetchPayments();
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setStarting(false);
    }
  }

  // Manual (re)send receipt
  async function emailReceipt(paymentId, fallbackEmail) {
    const to = window.prompt(
      "Send receipt to which email?",
      fallbackEmail || customerEmail || "you@example.com"
    );
    if (!to) return;
    try {
      const r = await fetch(`${API_BASE}/payments/${paymentId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_email: to }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to send");
      alert(`Receipt sent to ${to}`);
    } catch (e) {
      console.error(e);
      alert(`Failed to send: ${e.message || e}`);
    }
  }

  function openCheckout() {
    const url = startResult?.access_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>SavoPay POS (Sandbox)</h1>

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
            {/* Add more if needed */}
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
            {/* Add more if your ForumPay account supports them */}
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
            <button type="button" style={styles.secondaryBtn} onClick={openCheckout}>
              Open checkout
            </button>
          )}
        </div>

        {error && <div style={styles.error}>⚠️ {error}</div>}

        {startResult && (
          <div style={styles.resultBox}>
            <div><b>Payment ID:</b> {startResult.payment_id}</div>
            <div>
              <b>Checkout URL:</b>{" "}
              <a href={startResult.access_url} target="_blank" rel="noreferrer">
                {startResult.access_url}
              </a>
            </div>
          </div>
        )}
      </form>

      <section style={styles.card}>
        <div style={styles.listHeader}>
          <h2 style={styles.h2}>Recent payments</h2>
          <button onClick={fetchPayments} style={styles.secondaryBtn} disabled={loadingPayments}>
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
              {payments.map((row) => (
                <tr key={row.payment_id || row.created_at}>
                  <td>{row.created_at}</td>
                  <td>{row.order_id || "—"}</td>
                  <td>
                    {row.invoice_amount} {row.invoice_currency}
                  </td>
                  <td>
                    {(row.crypto_amount || "—")} {row.currency}
                  </td>
                  <td>{row.state || row.status}</td>
                  <td>{row.customer_email || "—"}</td>
                  <td>
                    <button
                      onClick={() => emailReceipt(row.payment_id, row.customer_email)}
                      disabled={!row?.payment_id || row?.state !== "confirmed"}
                      title={
                        !row?.payment_id || row?.state !== "confirmed"
                          ? "Available after confirmation"
                          : "Send receipt"
                      }
                      style={styles.smallBtn}
                    >
                      Email receipt
                    </button>
                    {" "}
                    {row?.payment_id && (
                      <a
                        href={`${API_BASE}/receipt/${row.payment_id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.linkBtn}
                      >
                        Print
                      </a>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 920, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial" },
  h1: { margin: "0 0 16px 0", fontSize: 28 },
  h2: { margin: "0", fontSize: 20 },
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 16, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  row: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12 },
  label: { width: 160, color: "#111", fontWeight: 600 },
  input: { flex: 1, minWidth: 200, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" },
  primaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  secondaryBtn: { display: "inline-block", padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer", textDecoration: "none" },
  smallBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  linkBtn: { padding: "6px 10px", borderRadius: 6, border: "1px solid #111", textDecoration: "none", color: "#111" },
  error: { marginTop: 12, color: "#b91c1c", fontWeight: 600 },
  resultBox: { marginTop: 12, padding: 12, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8 },
  listHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  table: { width: "100%", borderCollapse: "collapse" },
};
