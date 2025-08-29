// src/App.js
import React, { useEffect, useState, useRef } from "react";
import StatusPill from "./components/StatusPill";
import AdminPanel from "./components/AdminPanel";
import PinGate from "./components/PinGate";

const BUILD_TAG = "UI build: 2025-08-29 21:10";
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";

export default function App() {
  const [invoiceCurrency, setInvoiceCurrency] = useState(() => localStorage.getItem("fiat") || "USD");
  const [cryptoCurrency, setCryptoCurrency] = useState(() => localStorage.getItem("crypto") || "USDT");
  const [tipPct, setTipPct] = useState(() => {
    const v = parseInt(localStorage.getItem("tipPct") || "0", 10);
    return Number.isFinite(v) ? v : 0;
  });
  const [tipMode, setTipMode] = useState(() => localStorage.getItem("tipMode") || "percent");
  const [tipFixed, setTipFixed] = useState(() => localStorage.getItem("tipFixed") || "");
  const [cashier, setCashier] = useState(() => localStorage.getItem("cashier") || "");
  const [beepOn, setBeepOn] = useState(() => (localStorage.getItem("beepOn") !== "0"));
  const [autoOpenCheckout, setAutoOpenCheckout] = useState(() => localStorage.getItem("autoOpenCheckout") === "1");

  const [quickAmts, setQuickAmts] = useState(() => {
    const raw = localStorage.getItem("quickAmts");
    if (!raw) return ["5.00", "10.00", "20.00", "50.00"];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : ["5.00", "10.00", "20.00", "50.00"];
    } catch {
      return ["5.00", "10.00", "20.00", "50.00"];
    }
  });
  const [tipPresets, setTipPresets] = useState(() => {
    const raw = localStorage.getItem("tipPresets");
    if (!raw) return [0, 10, 15, 20];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : [0, 10, 15, 20];
    } catch {
      return [0, 10, 15, 20];
    }
  });

  useEffect(() => { localStorage.setItem("fiat", invoiceCurrency); }, [invoiceCurrency]);
  useEffect(() => { localStorage.setItem("crypto", cryptoCurrency); }, [cryptoCurrency]);
  useEffect(() => { localStorage.setItem("tipPct", String(tipPct)); }, [tipPct]);
  useEffect(() => { localStorage.setItem("tipMode", tipMode); }, [tipMode]);
  useEffect(() => { localStorage.setItem("tipFixed", tipFixed); }, [tipFixed]);
  useEffect(() => { localStorage.setItem("cashier", cashier); }, [cashier]);
  useEffect(() => { localStorage.setItem("beepOn", beepOn ? "1" : "0"); }, [beepOn]);
  useEffect(() => { localStorage.setItem("autoOpenCheckout", autoOpenCheckout ? "1" : "0"); }, [autoOpenCheckout]);
  useEffect(() => { localStorage.setItem("quickAmts", JSON.stringify(quickAmts)); }, [quickAmts]);
  useEffect(() => { localStorage.setItem("tipPresets", JSON.stringify(tipPresets)); }, [tipPresets]);

  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    function up() { setOnline(true); }
    function down() { setOnline(false); }
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const [amount, setAmount] = useState("25.00");
  const [payerId, setPayerId] = useState("walk-in");
  const [customerEmail, setCustomerEmail] = useState("");

  const base = safeNum(amount);
  const usingFixed = tipMode === "amount" && safeNum(tipFixed) > 0;
  const tipAmount = usingFixed ? round2(safeNum(tipFixed)) : round2((base * tipPct) / 100);
  const totalAmount = round2(base + tipAmount);

  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState(null);
  const [error, setError] = useState("");

  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const [emailTargetId, setEmailTargetId] = useState(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterStatus, setFilterStatus] = useState(() => localStorage.getItem("filterStatus") || "all");
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem("searchTerm") || "");
  const [onlyToday, setOnlyToday] = useState(() => localStorage.getItem("onlyToday") === "1");

  useEffect(() => { localStorage.setItem("filterStatus", filterStatus); }, [filterStatus]);
  useEffect(() => { localStorage.setItem("searchTerm", searchTerm); }, [searchTerm]);
  useEffect(() => { localStorage.setItem("onlyToday", onlyToday ? "1" : "0"); }, [onlyToday]);

  const [needsPinFor, setNeedsPinFor] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);

  const prevConfirmedRef = useRef(new Set());
  const searchRef = useRef(null);
  const amountRef = useRef(null);
  const appRef = useRef(null);
  const autoOpenedRef = useRef(false);

  const [lastSync, setLastSync] = useState(null);

  async function fetchPayments() {
    try {
      setLoadingPayments(true);
      const r = await fetch(`${API_BASE}/payments`);
      const data = await r.json();
      setPayments(Array.isArray(data) ? data : []);
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
      setLastSync(new Date());
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    fetchPayments();
    const t = setInterval(fetchPayments, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const url = startResult?.access_url;
    if (autoOpenCheckout && url && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      try { window.open(url, "_blank", "noopener,noreferrer"); } catch {}
    }
    if (!url) autoOpenedRef.current = false;
  }, [startResult, autoOpenCheckout]);

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const noMods = !e.metaKey && !e.ctrlKey && !e.altKey;

      if (noMods && e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (!typing && noMods && ["0", "1", "2", "3"].includes(e.key)) {
        const map = { "0": tipPresets[0] ?? 0, "1": tipPresets[1] ?? 10, "2": tipPresets[2] ?? 15, "3": tipPresets[3] ?? 20 };
        setTipMode("percent");
        setTipPct(map[e.key]);
        return;
      }
      if (!typing && noMods && e.key.toLowerCase() === "r") { fetchPayments(); return; }
      if (!typing && noMods && e.key.toLowerCase() === "f") {
        const order = ["all", "created", "waiting", "confirmed", "cancelled"];
        const idx = order.indexOf(filterStatus);
        setFilterStatus(order[(idx + 1) % order.length]); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const btn = document.querySelector('button[type="submit"]'); btn?.click(); return;
      }
      if (!typing && noMods && e.key.toLowerCase() === "a") { amountRef.current?.focus(); return; }
      if (!typing && noMods && e.key.toLowerCase() === "s") { setShowSettings((v) => !v); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterStatus, tipPresets]);

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
        meta_tip_percent: tipMode === "percent" ? tipPct : null,
        meta_tip_amount: tipAmount.toFixed(2),
        meta_tip_mode: tipMode,
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
      let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
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
    setTipMode("percent");
    setTipFixed("");
    setPayerId("walk-in");
    setCustomerEmail("");
    setStartResult(null);
    setError("");
    amountRef.current?.focus();
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
      console.error("recheck error", e);
      alert(`Re-check failed: ${e.message || e}`);
    }
  }

  function openCheckout() {
    const url = startResult?.access_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function openLastConfirmedReceipt() {
    if (!payments.length) return alert("No payments yet.");
    const confirmed = payments
      .filter(isConfirmedRow)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    if (!confirmed.length) return alert("No confirmed payments yet.");
    const pid = confirmed[0].payment_id;
    if (!pid) return alert("Missing payment id.");
    window.open(`${API_BASE}/receipt/${encodeURIComponent(pid)}/print`, "_blank", "noopener,noreferrer");
  }

  async function toggleFullscreen() {
    const el = appRef.current || document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {}
  }

  function showShortcuts() {
    alert(
`Shortcuts:
  /        Focus search
  a        Focus amount
  0/1/2/3  Set tip 0/10/15/20 (from presets)
  r        Refresh list
  f        Cycle status filter
  s        Toggle Settings
  ⌘/Ctrl+Enter  Charge`
    );
  }

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
    if (onlyToday) {
      const createdISO = String(row.created_at || "");
      const rowDay = createdISO.slice(0, 10);
      const todayDay = new Date().toISOString().slice(0, 10);
      if (rowDay !== todayDay) return false;
    }
    return true;
  });

  const confirmedCount = payments.filter(isConfirmedRow).length;
  const totalCount = payments.length;
  const confirmedTotals = sumConfirmedByFiat(filteredPayments);

  function exportFilteredCsv() {
    try {
      const headers = [
        "created_at",
        "payment_id",
        "order_id",
        "invoice_amount",
        "invoice_currency",
        "crypto_amount",
        "currency",
        "state",
        "status",
        "cashier",
        "tip_amount",
        "tip_percent",
        "tip_mode",
        "customer_email"
      ];
      const rows = filteredPayments.map((r) => ([
        r.created_at || "",
        r.payment_id || "",
        r.order_id || "",
        toFixedOrEmpty(r.invoice_amount),
        String(r.invoice_currency || "").toUpperCase(),
        toFixedOrEmpty(r.crypto_amount),
        r.currency || "",
        r.state || "",
        r.status || "",
        r.meta_cashier || "",
        toFixedOrEmpty(r.meta_tip_amount),
        r.meta_tip_percent != null ? String(r.meta_tip_percent) : "",
        r.meta_tip_mode || "",
        r.customer_email || "",
      ]));
      const csv = [headers, ...rows].map(cols => cols.map(csvEscape).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0,10);
      a.download = `savopay_filtered_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export CSV.");
      console.error("exportFilteredCsv error:", e);
    }
  }

  return (
    <div style={styles.wrap} ref={appRef}>
      {!online && (
        <div style={styles.offlineBanner}>
          You’re offline. New charges are disabled until connection is restored.
        </div>
      )}

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>SavoPay POS (Sandbox)</h1>
          <div style={{ color: "#6b7280", margin: "0 0 12px 0", fontSize: 12 }}>{BUILD_TAG}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: online ? "#ecfdf5" : "#fef2f2", color: online ? "#065f46" : "#991b1b",
              border: `1px solid ${online ? "#a7f3d0" : "#fecaca"}`
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: online ? "#065f46" : "#991b1b", display: "inline-block" }} />
              {online ? "Online" : "Offline"}
            </span>
            <span style={{ fontSize: 12, color: "#374151" }}>
              {lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : "Last sync: —"}
            </span>
          </div>

          <button style={styles.secondaryBtn} onClick={() => setBeepOn(b => !b)}>
            {beepOn ? "Sound: On" : "Sound: Off"}
          </button>
          <button style={styles.secondaryBtn} onClick={() => setAutoOpenCheckout(v => !v)}>
            {autoOpenCheckout ? "Auto-open: On" : "Auto-open: Off"}
          </button>
          <button style={styles.secondaryBtn} onClick={requestNotify}>
            Enable alerts
          </button>
          <button style={styles.secondaryBtn} onClick={toggleFullscreen}>
            Fullscreen
          </button>
          <button style={styles.secondaryBtn} onClick={showShortcuts}>
            Shortcuts
          </button>
          <button style={styles.secondaryBtn} onClick={openLastConfirmedReceipt}>
            Reprint last confirmed
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={() => {
              if (!settingsUnlocked) setNeedsPinFor("settings");
              else setShowSettings(true);
            }}
          >
            Settings
          </button>
          <button style={styles.secondaryBtn} onClick={resetForm}>
            New sale
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={() => {
              if (!adminUnlocked) setNeedsPinFor("admin");
              else setShowAdmin((s) => !s);
            }}
          >
            {showAdmin ? "Close Admin" : "Open Admin"}
          </button>
        </div>
      </div>

      {showAdmin && (
        <section style={styles.card}>
          <AdminPanel apiBase={API_BASE} />
        </section>
      )}

      <form onSubmit={handleStartPayment} style={styles.card}>
        <div style={styles.row}>
          <label style={styles.label}>Amount (before tip)</label>
          <div style={{ flex: 1 }}>
            <input
              ref={amountRef}
              style={styles.input}
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <div style={{ margin: "8px 0 4px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {quickAmts.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(v)}
                  style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
                >
                  {Number(safeNum(v)).toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ ...styles.row, alignItems: "flex-start" }}>
          <label style={styles.label}>Tip</label>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {tipPresets.map((p) => (
                <button
                  key={`t${p}`}
                  type="button"
                  onClick={() => { setTipMode("percent"); setTipPct(Number(p) || 0); }}
                  style={{ ...styles.segmentBtn, ...(tipMode === "percent" && tipPct === Number(p) ? styles.segmentBtnActive : {}) }}
                >
                  {Number(p)}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTipMode("amount")}
                style={{ ...styles.segmentBtn, ...(tipMode === "amount" ? styles.segmentBtnActive : {}) }}
              >
                Other
              </button>
              {tipMode === "amount" && (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipFixed}
                  onChange={(e) => setTipFixed(e.target.value)}
                  placeholder="Enter tip amount"
                  style={{ ...styles.input, maxWidth: 160 }}
                />
              )}
            </div>

            <div style={{ fontSize: 12, color: "#374151" }}>
              {tipMode === "amount" ? (
                <>Tip: <b>{fmt(tipAmount, invoiceCurrency)}</b> (fixed)</>
              ) : (
                <>Tip: <b>{fmt(tipAmount, invoiceCurrency)}</b> ({tipPct}%)</>
              )}
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
          <button type="submit" style={styles.primaryBtn} disabled={starting || !online}>
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
            <span style={styles.statText}>
              • Totals (confirmed): <b>{formatTotals(confirmedTotals)}</b>
            </span>
            <button onClick={exportFilteredCsv} style={styles.secondaryBtn}>
              Export filtered CSV
            </button>
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

            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
              <input
                type="checkbox"
                checked={onlyToday}
                onChange={(e) => setOnlyToday(e.target.checked)}
              />
              Today only
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontWeight: 600 }}>Search</label>
            <input
              ref={searchRef}
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
                  ? `${fixed2(row.meta_tip_amount)} ${row.invoice_currency}${row.meta_tip_percent != null ? ` (${row.meta_tip_percent}%)` : (row.meta_tip_mode ? ` (${row.meta_tip_mode})` : "")}`
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

      {needsPinFor && (
        <PinGate
          onUnlock={() => {
            if (needsPinFor === "admin") {
              setAdminUnlocked(true);
              setShowAdmin(true);
            } else if (needsPinFor === "settings") {
              setSettingsUnlocked(true);
              setShowSettings(true);
            }
            setNeedsPinFor(null);
          }}
          onClose={() => setNeedsPinFor(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          close={() => setShowSettings(false)}
          quickAmts={quickAmts}
          setQuickAmts={setQuickAmts}
          tipPresets={tipPresets}
          setTipPresets={setTipPresets}
          beepOn={beepOn}
          setBeepOn={setBeepOn}
          autoOpenCheckout={autoOpenCheckout}
          setAutoOpenCheckout={setAutoOpenCheckout}
          invoiceCurrency={invoiceCurrency}
          setInvoiceCurrency={setInvoiceCurrency}
          cryptoCurrency={cryptoCurrency}
          setCryptoCurrency={setCryptoCurrency}
        />
      )}
    </div>
  );
}

function SettingsModal({
  close,
  quickAmts, setQuickAmts,
  tipPresets, setTipPresets,
  beepOn, setBeepOn,
  autoOpenCheckout, setAutoOpenCheckout,
  invoiceCurrency, setInvoiceCurrency,
  cryptoCurrency, setCryptoCurrency,
}) {
  const [amtsText, setAmtsText] = useState(quickAmts.join(", "));
  const [tipsText, setTipsText] = useState(tipPresets.join(", "));
  const [pinText, setPinText] = useState("");

  function save() {
    const amts = amtsText.split(",").map(s => Number(safeNum(s.trim())).toFixed(2)).filter(x => Number(x) > 0);
    const tips = tipsText.split(",").map(s => parseInt(String(s).trim(), 10)).filter(n => Number.isFinite(n));
    if (amts.length) setQuickAmts(amts);
    if (tips.length) setTipPresets(tips);
    if (pinText.trim()) {
      localStorage.setItem("adminPin", pinText.trim());
    }
    close();
  }

  return (
    <div style={styles.modalOverlay} onClick={close}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Settings</h3>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Quick amounts</div>
            <input
              style={styles.input}
              value={amtsText}
              onChange={(e) => setAmtsText(e.target.value)}
              placeholder="e.g. 5, 10, 20, 50"
            />
            <div style={styles.hint}>Comma-separated; shown as quick buttons under Amount.</div>
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Tip presets (%)</div>
            <input
              style={styles.input}
              value={tipsText}
              onChange={(e) => setTipsText(e.target.value)}
              placeholder="e.g. 0, 10, 15, 20"
            />
            <div style={styles.hint}>Comma-separated percentages; used for tip buttons.</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontWeight: 600, width: 140 }}>Default fiat</label>
            <select
              style={{ ...styles.input, maxWidth: 160 }}
              value={invoiceCurrency}
              onChange={(e) => setInvoiceCurrency(e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>

            <label style={{ fontWeight: 600, width: 140 }}>Default crypto</label>
            <select
              style={{ ...styles.input, maxWidth: 180 }}
              value={cryptoCurrency}
              onChange={(e) => setCryptoCurrency(e.target.value)}
            >
              <option value="USDT">USDT (ERC20)</option>
            </select>
          </div>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={beepOn} onChange={(e) => setBeepOn(e.target.checked)} />
            Sound on confirmation
          </label>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={autoOpenCheckout} onChange={(e) => setAutoOpenCheckout(e.target.checked)} />
            Auto-open checkout after creating payment
          </label>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Admin PIN</div>
            <input
              style={styles.input}
              type="password"
              placeholder="Enter new PIN (leave blank to keep)"
              value={pinText}
              onChange={(e) => setPinText(e.target.value)}
            />
            <div style={styles.hint}>Default is 0000. Changing it updates this browser/device.</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button style={styles.secondaryBtn} onClick={close}>Cancel</button>
          <button style={styles.primaryBtn} onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

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
function toFixedOrEmpty(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}
function isConfirmedRow(row) {
  return String(row?.state || row?.status || "").toLowerCase() === "confirmed";
}
function sumConfirmedByFiat(rows) {
  const out = {};
  for (const r of rows) {
    if (isConfirmedRow(r)) {
      const ccy = String(r.invoice_currency || "").toUpperCase();
      const amt = Number(r.invoice_amount);
      if (Number.isFinite(amt) && ccy) out[ccy] = (out[ccy] || 0) + amt;
    }
  }
  return out;
}
function formatTotals(map) {
  const parts = Object.entries(map).map(([ccy, amt]) => `${amt.toFixed(2)} ${ccy}`);
  return parts.length ? parts.join(" • ") : "0.00";
}
function csvEscape(x) {
  const s = String(x ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

const styles = {
  wrap: { maxWidth: 980, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial" },
  offlineBanner: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    textAlign: "center",
    fontWeight: 600,
  },
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
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
  },
  modal: {
    background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
    width: "min(640px, 96vw)", padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.2)"
  },
  hint: { fontSize: 12, color: "#6b7280", marginTop: 4 },
};
