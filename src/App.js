// src/App.js
import React, { useEffect, useState, useRef } from "react";
import StatusPill from "./components/StatusPill";
import AdminPanel from "./components/AdminPanel";
import PinGate from "./components/PinGate";

const BUILD_TAG = "UI build: 2025-09-02 19:10 • PROD";
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5050";
const CCY_PREFIX = { USD: "$", GBP: "£", EUR: "€", NGN: "₦" };

const IS_PROD =
  typeof window !== "undefined" &&
  /(^|\.)pos\.savopay\.co$/i.test(window.location.host);

const SHOW_ADMIN_UI =
  typeof window !== "undefined" &&
  (!IS_PROD ||
    localStorage.getItem("showAdminUI") === "1" ||
    /\badmin=1\b/.test(window.location.search));

const DEBUG =
  typeof window !== "undefined" &&
  /(?:[?&])debug=1(?:&|$)/.test(window.location.search);

// ---------- Helpers to normalize supported crypto/network data ----------
function normalizeSupported(payload) {
  // Return { cryptos: [{ symbol: "USDT", label: "USDT", networks: ["ERC20","TRON"] }, ...] }
  const out = [];

  if (!payload) return { cryptos: out };

  // Common shape A:
  // { assets: [{ currency: "USDT", networks: ["ERC20","TRON"] }, { currency: "BTC", networks: ["BTC"] }] }
  if (Array.isArray(payload.assets)) {
    for (const a of payload.assets) {
      const symbol = String(a.currency || a.symbol || "").toUpperCase();
      if (!symbol) continue;
      const networks = Array.isArray(a.networks)
        ? a.networks.map((n) => String(n).toUpperCase()).filter(Boolean)
        : [];
      out.push({ symbol, label: symbol, networks });
    }
    return { cryptos: out };
  }

  // Common shape B:
  // { cryptos: { USDT: ["ERC20","TRON"], BTC: ["BTC"] } }
  if (payload.cryptos && typeof payload.cryptos === "object") {
    for (const [sym, nets] of Object.entries(payload.cryptos)) {
      const symbol = String(sym).toUpperCase();
      const networks = Array.isArray(nets)
        ? nets.map((n) => String(n).toUpperCase()).filter(Boolean)
        : [];
      out.push({ symbol, label: symbol, networks });
    }
    return { cryptos: out };
  }

  // Common shape C:
  // { currencies: [{ code: "USDT", chains: ["ERC20","TRON"] }, ...] }
  if (Array.isArray(payload.currencies)) {
    for (const c of payload.currencies) {
      const symbol = String(c.code || c.symbol || "").toUpperCase();
      if (!symbol) continue;
      const networks = Array.isArray(c.chains)
        ? c.chains.map((n) => String(n).toUpperCase()).filter(Boolean)
        : [];
      out.push({ symbol, label: symbol, networks });
    }
    return { cryptos: out };
  }

  // Fallback: if payload is an array of strings like ["USDT","BTC"]
  if (Array.isArray(payload)) {
    for (const s of payload) {
      const symbol = String(s).toUpperCase();
      if (!symbol) continue;
      out.push({ symbol, label: symbol, networks: [] });
    }
    return { cryptos: out };
  }

  return { cryptos: out };
}

// Default fallback list if backend endpoint isn't ready
const FALLBACK_CRYPTOS = [
  { symbol: "USDT", label: "USDT", networks: ["ERC20", "TRON"] },
  { symbol: "USDC", label: "USDC", networks: ["ERC20"] },
  { symbol: "BTC", label: "BTC", networks: ["BTC"] },
  { symbol: "ETH", label: "ETH", networks: ["ERC20"] },
];

export default function App() {
  // One-time minimal CSS (spinner + shimmer)
  useEffect(() => {
    if (document.getElementById("savopay-inline-style")) return;
    const style = document.createElement("style");
    style.id = "savopay-inline-style";
    style.innerHTML = `
      @keyframes savopay-spin { to { transform: rotate(360deg); } }
      .spin { animation: savopay-spin 1s linear infinite; }
      @keyframes savopay-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .shimmer {
        background: linear-gradient(90deg, rgba(0,0,0,.06) 25%, rgba(0,0,0,.12) 37%, rgba(0,0,0,.06) 63%);
        background-size: 400% 100%;
        animation: savopay-shimmer 1.2s ease-in-out infinite;
        border-radius: 6px;
      }
      .skeleton { height: 14px; min-width: 80px; }
      .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .status-ok { background: #16a34a; }
      .status-err { background: #dc2626; }
    `;
    document.head.appendChild(style);
  }, []);

  // ---------- Saved prefs ----------
  const [invoiceCurrency, setInvoiceCurrency] = useState(
    () => localStorage.getItem("fiat") || "USD"
  );
  const [cryptoCurrency, setCryptoCurrency] = useState(
    () => localStorage.getItem("crypto") || "USDT"
  );
  const [network, setNetwork] = useState(
    () => localStorage.getItem("network") || "ERC20"
  );
  const [tipPct, setTipPct] = useState(() => {
    const v = parseInt(localStorage.getItem("tipPct") || "0", 10);
    return Number.isFinite(v) ? v : 0;
  });
  const [tipMode, setTipMode] = useState(
    () => localStorage.getItem("tipMode") || "percent"
  );
  const [tipFixed, setTipFixed] = useState(
    () => localStorage.getItem("tipFixed") || ""
  );
  const [cashier, setCashier] = useState(
    () => localStorage.getItem("cashier") || ""
  );
  const [beepOn, setBeepOn] = useState(
    () => localStorage.getItem("beepOn") !== "0"
  );
  const [autoOpenCheckout, setAutoOpenCheckout] = useState(
    () => localStorage.getItem("autoOpenCheckout") === "1"
  );

  // Presets
  const DEFAULT_AMTS = ["5.00", "10.00", "20.00", "50.00"];
  const DEFAULT_TIPS = [0, 10, 15, 20];

  const [quickAmts, setQuickAmts] = useState(() => {
    const raw = localStorage.getItem("quickAmts");
    if (!raw) return DEFAULT_AMTS;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : DEFAULT_AMTS;
    } catch {
      return DEFAULT_AMTS;
    }
  });
  const [tipPresets, setTipPresets] = useState(() => {
    const raw = localStorage.getItem("tipPresets");
    if (!raw) return DEFAULT_TIPS;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : DEFAULT_TIPS;
    } catch {
      return DEFAULT_TIPS;
    }
  });

  useEffect(() => { localStorage.setItem("fiat", invoiceCurrency); }, [invoiceCurrency]);
  useEffect(() => { localStorage.setItem("crypto", cryptoCurrency); }, [cryptoCurrency]);
  useEffect(() => { localStorage.setItem("network", network); }, [network]);
  useEffect(() => { localStorage.setItem("tipPct", String(tipPct)); }, [tipPct]);
  useEffect(() => { localStorage.setItem("tipMode", tipMode); }, [tipMode]);
  useEffect(() => { localStorage.setItem("tipFixed", tipFixed); }, [tipFixed]);
  useEffect(() => { localStorage.setItem("cashier", cashier); }, [cashier]);
  useEffect(() => { localStorage.setItem("beepOn", beepOn ? "1" : "0"); }, [beepOn]);
  useEffect(() => { localStorage.setItem("autoOpenCheckout", autoOpenCheckout ? "1" : "0"); }, [autoOpenCheckout]);
  useEffect(() => { localStorage.setItem("quickAmts", JSON.stringify(quickAmts)); }, [quickAmts]);
  useEffect(() => { localStorage.setItem("tipPresets", JSON.stringify(tipPresets)); }, [tipPresets]);

  // ---------- Online/offline ----------
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // ---------- Charge form ----------
  const [amount, setAmount] = useState("25.00");
  const [payerId, setPayerId] = useState("walk-in");
  const [customerEmail, setCustomerEmail] = useState("");

  const base = safeNum(amount);
  const usingFixed = tipMode === "amount" && safeNum(tipFixed) > 0;
  const safeFixedTip = Math.max(0, safeNum(tipFixed));
  const tipAmount = usingFixed ? round2(safeFixedTip) : round2((base * tipPct) / 100);
  const totalAmount = round2(base + tipAmount);
  const isAmountValid = base >= 0.01;
  const canSubmit = !(!online || !isAmountValid);

  // ---------- Start payment ----------
  const [starting, setStarting] = useState(false);
  const [startResult, setStartResult] = useState(null);
  const [error, setError] = useState("");

  // ---------- Data ----------
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // ---------- Crypto options (NEW) ----------
  const [cryptoOptions, setCryptoOptions] = useState(FALLBACK_CRYPTOS);
  const [loadingCryptos, setLoadingCryptos] = useState(false);

  async function fetchSupportedCryptos() {
    // Try a few endpoints; normalize whatever we get
    const endpoints = [
      `${API_BASE}/meta/supported`,
      `${API_BASE}/supported`,
      `${API_BASE}/currencies`,
      `${API_BASE}/forumpay/options`,
    ];
    setLoadingCryptos(true);
    try {
      for (const url of endpoints) {
        try {
          const r = await fetch(url, { method: "GET" });
          if (!r.ok) continue;
          const data = await r.json();
          const norm = normalizeSupported(data);
          if (norm.cryptos && norm.cryptos.length) {
            setCryptoOptions(norm.cryptos);
            if (DEBUG) console.log("Supported cryptos (normalized):", norm.cryptos);

            // Ensure current selections are valid
            const hasCrypto = !!norm.cryptos.find((c) => c.symbol === cryptoCurrency);
            let nextCrypto = cryptoCurrency;
            if (!hasCrypto) nextCrypto = norm.cryptos[0].symbol;
            const nets = norm.cryptos.find((c) => c.symbol === nextCrypto)?.networks || [];
            let nextNet = network;
            if (nets.length && !nets.includes(network)) nextNet = nets[0];
            if (!nets.length) nextNet = ""; // coin with no network choice (e.g., BTC)
            if (nextCrypto !== cryptoCurrency) setCryptoCurrency(nextCrypto);
            if (nextNet !== network) setNetwork(nextNet);
            setLoadingCryptos(false);
            return;
          }
        } catch {
          // try next
        }
      }
      // If none worked, keep fallback
      setLoadingCryptos(false);
    } catch {
      setLoadingCryptos(false);
    }
  }

  useEffect(() => { fetchSupportedCryptos(); /* on mount */ }, []);

  // ---------- Email inline UI ----------
  const [emailTargetId, setEmailTargetId] = useState(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // ---------- Admin + filters ----------
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filterStatus, setFilterStatus] = useState(
    () => localStorage.getItem("filterStatus") || "all"
  );
  const [searchTerm, setSearchTerm] = useState(
    () => localStorage.getItem("searchTerm") || ""
  );
  const [onlyToday, setOnlyToday] = useState(
    () => localStorage.getItem("onlyToday") === "1"
  );
  const [filterCashier, setFilterCashier] = useState(
    () => localStorage.getItem("filterCashier") || "all"
  );

  useEffect(() => { localStorage.setItem("filterStatus", filterStatus); }, [filterStatus]);
  useEffect(() => { localStorage.setItem("searchTerm", searchTerm); }, [searchTerm]);
  useEffect(() => { localStorage.setItem("onlyToday", onlyToday ? "1" : "0"); }, [onlyToday]);
  useEffect(() => { localStorage.setItem("filterCashier", filterCashier); }, [filterCashier]);

  // ---------- PIN gate state ----------
  const [needsPinFor, setNeedsPinFor] = useState(null); // 'admin' | 'settings' | null
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);

  // ---------- Auto-refresh controls ----------
  const [autoRefresh, setAutoRefresh] = useState(
    () => localStorage.getItem("autoRefresh") !== "0"
  );
  const [refreshEverySec, setRefreshEverySec] = useState(() => {
    const v = parseInt(localStorage.getItem("refreshEverySec") || "5", 10);
    return Number.isFinite(v) ? v : 5;
  });
  useEffect(() => { localStorage.setItem("autoRefresh", autoRefresh ? "1" : "0"); }, [autoRefresh]);
  useEffect(() => { localStorage.setItem("refreshEverySec", String(refreshEverySec)); }, [refreshEverySec]);

  // ---------- Refs ----------
  const prevConfirmedRef = useRef(new Set());
  const searchRef = useRef(null);
  const amountRef = useRef(null);
  const appRef = useRef(null);

  // ---------- Status ----------
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

  // Initial fetch on mount
  useEffect(() => { fetchPayments(); }, []);

  // Prod: lock admin on mount
  useEffect(() => { if (IS_PROD) setAdminUnlocked(false); }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    const ms = Math.max(2, refreshEverySec) * 1000;
    const t = setInterval(fetchPayments, ms);
    return () => clearInterval(t);
  }, [autoRefresh, refreshEverySec]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const noMods = !e.metaKey && !e.ctrlKey && !e.altKey;

      if (noMods && e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (!typing && noMods && ["0","1","2","3"].includes(e.key)) {
        const map = { 0: tipPresets[0] ?? 0, 1: tipPresets[1] ?? 10, 2: tipPresets[2] ?? 15, 3: tipPresets[3] ?? 20 };
        setTipMode("percent"); setTipPct(map[e.key]); return;
      }
      if (!typing && noMods && e.key.toLowerCase() === "r") { fetchPayments(); return; }
      if (!typing && noMods && e.key.toLowerCase() === "f") {
        const order = ["all","created","waiting","confirmed","cancelled"];
        const idx = order.indexOf(filterStatus);
        setFilterStatus(order[(idx + 1) % order.length]); return;
      }
      if (!typing && noMods && e.key.toLowerCase() === "p") { setAutoRefresh(v => !v); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { document.querySelector('button[type="submit"]')?.click(); return; }
      if (!typing && noMods && e.key.toLowerCase() === "a") { amountRef.current?.focus(); return; }
      if (!typing && noMods && e.key.toLowerCase() === "s") { setShowSettings(v => !v); return; }
      if (e.key === "Escape") {
        setShowSettings(false);
        setShowAdmin(false);
        if (emailTargetId) { setEmailTargetId(null); setEmailAddress(""); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterStatus, tipPresets, emailTargetId]);

  // Charge handler (popup-safe)
  async function handleStartPayment(e) {
    e.preventDefault();
    if (starting) return;
    if (!isAmountValid) { setError("Enter an amount of at least 0.01"); return; }
    setError("");
    setStartResult(null);
    setStarting(true);

    // Open a placeholder tab synchronously to avoid popup blockers
    let checkoutWin = null;
    if (autoOpenCheckout) {
      try { checkoutWin = window.open("about:blank", "_blank", "noopener,noreferrer"); } catch {}
    }

    try {
      // Guard: NGN temporarily (until ForumPay confirms enablement)
      if (invoiceCurrency === "NGN") {
        setError("NGN is not enabled on the payment gateway. Please choose USD, EUR, or GBP.");
        if (checkoutWin && !checkoutWin.closed) checkoutWin.close();
        setStarting(false);
        return;
      }

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
        meta_network: network || null, // some coins (BTC) may not need a network
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

      if (DEBUG) console.log("start-payment response:", json);
      setStartResult(json);
      fetchPayments();

      const access_url =
        json?.access_url || json?.checkout_url || json?.payment_url || json?.url || json?.accessUrl || null;

      if (access_url && autoOpenCheckout) {
        if (checkoutWin && !checkoutWin.closed) {
          try { checkoutWin.location = access_url; checkoutWin.focus?.(); } catch {}
        } else {
          try { window.open(access_url, "_blank", "noopener,noreferrer"); } catch {}
        }
      } else if (checkoutWin && !checkoutWin.closed) {
        try { checkoutWin.close(); } catch {}
      }
    } catch (e) {
      console.error("handleStartPayment error:", e);
      setError(String(e.message || e));
      try { if (checkoutWin && !checkoutWin.closed) checkoutWin.close(); } catch {}
    } finally {
      setTimeout(() => setStarting(false), 250);
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

  // Email helpers
  function openEmailForm(row) {
    setEmailTargetId(row.payment_id);
    setEmailAddress(row.customer_email || customerEmail || "");
  }
  function cancelEmailForm() { setEmailTargetId(null); setEmailAddress(""); }
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
    const url =
      startResult?.access_url || startResult?.checkout_url || startResult?.payment_url || startResult?.url || startResult?.accessUrl || null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyPayload() {
    try { const s = JSON.stringify(startResult || {}, null, 2); copyToClipboard(s); }
    catch { alert("Nothing to copy."); }
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
      if (!document.fullscreenElement) { await el.requestFullscreen?.(); }
      else { await document.exitFullscreen?.(); }
    } catch {}
  }

  function showShortcuts() {
    alert(`Shortcuts:
  /        Focus search
  a        Focus amount
  0/1/2/3  Set tip 0/10/15/20
  r        Refresh list
  f        Cycle status filter
  p        Toggle auto-refresh
  s        Toggle Settings
  ⌘/Ctrl+Enter  Charge`);
  }

  // Secret tap to reveal Admin button on prod
  const tapRef = useRef({ n: 0, t: 0 });
  function secretTap() {
    const now = Date.now();
    if (now - tapRef.current.t > 3000) tapRef.current.n = 0;
    tapRef.current.t = now;
    tapRef.current.n += 1;
    if (tapRef.current.n >= 5) {
      localStorage.setItem("showAdminUI", "1");
      window.location.reload();
    }
  }

  function closeAdmin() { setShowAdmin(false); if (IS_PROD) setAdminUnlocked(false); }

  // Derived lists & filters
  const cashierOptions = Array.from(new Set(payments.map(p => (p.meta_cashier || "").trim()).filter(Boolean))).sort();

  const filteredPayments = payments.filter((row) => {
    const status = String(row.state || row.status || "").toLowerCase();
    if (filterStatus !== "all" && status !== filterStatus) return false;
    if (filterCashier !== "all") {
      const c = String(row.meta_cashier || "").trim();
      if (c !== filterCashier) return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const hay = [row.payment_id, row.order_id, row.customer_email, row.payer_id, row.meta_cashier]
        .map((s) => String(s || "").toLowerCase()).join(" ");
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
        "created_at","payment_id","order_id","invoice_amount","invoice_currency",
        "crypto_amount","currency","state","status","cashier","tip_amount","tip_percent","tip_mode","customer_email"
      ];
      const rows = filteredPayments.map((r) => ([
        r.created_at || "", r.payment_id || "", r.order_id || "",
        toFixedOrEmpty(r.invoice_amount), String(r.invoice_currency || "").toUpperCase(),
        toFixedOrEmpty(r.crypto_amount), r.currency || "", r.state || "", r.status || "",
        r.meta_cashier || "", toFixedOrEmpty(r.meta_tip_amount),
        r.meta_tip_percent != null ? String(r.meta_tip_percent) : "", r.meta_tip_mode || "", r.customer_email || "",
      ]));
      const csv = [headers, ...rows].map(cols => cols.map(csvEscape).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0,10);
      a.download = `savopay_filtered_${today}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export CSV.");
      console.error("exportFilteredCsv error:", e);
    }
  }

  // Header badge for current crypto/network
  const selectedCrypto = cryptoOptions.find(c => c.symbol === cryptoCurrency);
  const networksForSelected = selectedCrypto?.networks || [];
  useEffect(() => {
    // If current network isn't supported by the selected crypto, fix it
    if (networksForSelected.length === 0) {
      if (network) setNetwork(""); // no network required (e.g., BTC)
    } else if (!networksForSelected.includes(network)) {
      setNetwork(networksForSelected[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cryptoCurrency, JSON.stringify(networksForSelected)]);

  const cryptoBadge = `${cryptoCurrency}${networksForSelected.length ? ` • ${network}` : ""}`;

  return (
    <div ref={appRef} className="app-shell">
      {!online && (
        <div className="toast" role="status" aria-live="polite">
          You’re offline. New charges are disabled until connection is restored.
        </div>
      )}

      <header className="row" style={{ alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 onClick={secretTap} style={{ cursor: IS_PROD ? "pointer" : "default" }}>
            SavoPay POS
          </h1>
          <div className="hint">{BUILD_TAG}</div>
        </div>

        <div className="input-group" style={{ flexWrap: "wrap" }}>
          <div className="status-pill" aria-label={online ? "Online" : "Offline"}>
            <span className={`status-dot ${online ? "status-ok" : "status-err"}`} />
            {online ? "Online" : "Offline"} •{" "}
            {lastSync ? `Last sync: ${lastSync.toLocaleTimeString()}` : "Last sync: —"}
            {autoRefresh && (
              <span
                className="spin"
                aria-hidden="true"
                style={{
                  width: 10, height: 10, borderRadius: 999, border: "2px solid #9ca3af",
                  borderTopColor: "#111", display: "inline-block", marginLeft: 8,
                }}
                title="Auto-refreshing"
              />
            )}
          </div>

          <span className="badge" title="Current crypto & network">{cryptoBadge}</span>

          <div className="badge">
            Auto-refresh
            <label className="input-group" style={{ marginLeft: 6 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                aria-label="Toggle auto refresh"
              />
              {autoRefresh ? "On" : "Off"}
            </label>
            <select
              value={refreshEverySec}
              onChange={(e) => setRefreshEverySec(parseInt(e.target.value || "5", 10) || 5)}
              className="select"
              disabled={!autoRefresh}
              style={{ width: 96 }}
              aria-label="Auto refresh interval"
            >
              {[3,5,10,30,60].map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          </div>

          <button className="btn btn-ghost" onClick={() => setBeepOn(b => !b)} aria-label="Toggle sound">
            {beepOn ? "Sound: On" : "Sound: Off"}
          </button>
          <button className="btn btn-ghost" onClick={() => setAutoOpenCheckout(v => !v)} aria-label="Toggle auto open checkout">
            {autoOpenCheckout ? "Auto-open: On" : "Auto-open: Off"}
          </button>
          <button className="btn btn-ghost" onClick={requestNotify} aria-label="Enable alerts">Enable alerts</button>
          <button className="btn btn-ghost" onClick={toggleFullscreen} aria-label="Toggle fullscreen">Fullscreen</button>
          <button className="btn btn-ghost" onClick={showShortcuts} aria-label="Show shortcuts">Shortcuts</button>
          <button className="btn btn-ghost" onClick={openLastConfirmedReceipt} aria-label="Reprint last confirmed">Reprint last confirmed</button>
          <button
            className="btn btn-outline"
            onClick={() => { if (!settingsUnlocked) setNeedsPinFor("settings"); else setShowSettings(true); }}
            aria-label="Open settings"
          >
            Settings
          </button>
          {SHOW_ADMIN_UI && (
            <button
              className="btn btn-outline"
              onClick={() => { if (!adminUnlocked) setNeedsPinFor("admin"); else setShowAdmin((s) => !s); }}
              aria-label="Open admin"
            >
              {showAdmin ? "Close Admin" : "Open Admin"}
            </button>
          )}
        </div>
      </header>

      {showAdmin && (
        <section className="card">
          <div className="card-header"><h2>Admin</h2></div>
          <div className="card-body">
            <AdminPanel apiBase={API_BASE} />
            <div className="card-footer" style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={closeAdmin}>Close</button>
            </div>
          </div>
        </section>
      )}

      {/* Charge form */}
      <form onSubmit={handleStartPayment} className="card">
        <div className="card-header"><h2>Create charge</h2></div>
        <div className="card-body row">
          <div className="row">
            <label className="label">Amount (before tip)</label>
            <div className="w-full">
              <div className="field">
                <span className="input-prefix">{CCY_PREFIX[invoiceCurrency] || "¤"}</span>
                <input
                  ref={amountRef}
                  className="input input-has-prefix"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onBlur={() => setAmount(Number(safeNum(amount)).toFixed(2))}
                  required
                  aria-invalid={!isAmountValid}
                  aria-describedby="amountHelp"
                />
              </div>
              <div id="amountHelp" className="hint">
                Minimum chargeable base amount is 0.01 {invoiceCurrency}.
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {quickAmts.map((v) => (
                  <button key={v} type="button" className="btn btn-ghost" onClick={() => { setAmount(v); amountRef.current?.focus(); }} aria-label={`Set amount ${v}`}>
                    {Number(safeNum(v)).toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="row">
            <label className="label">Tip</label>
            <div className="w-full">
              <div className="input-group" style={{ flexWrap: "wrap" }}>
                {tipPresets.map((p) => {
                  const active = tipMode === "percent" && tipPct === Number(p);
                  return (
                    <button
                      key={`t${p}`}
                      type="button"
                      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => { setTipMode("percent"); setTipPct(Number(p) || 0); }}
                      aria-label={`Tip ${p}%`}
                    >
                      {Number(p)}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`btn ${tipMode === "amount" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setTipMode("amount")}
                  aria-label="Tip other amount"
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
                    onBlur={() => setTipFixed(Number(safeNum(tipFixed)).toFixed(2))}
                    placeholder="Enter tip amount"
                    className="input"
                    style={{ maxWidth: 200 }}
                    aria-label="Fixed tip amount"
                  />
                )}
              </div>
              <div className="hint">
                {tipMode === "amount" ? <>Tip: <b>{fmt(tipAmount, invoiceCurrency)}</b> (fixed)</> : <>Tip: <b>{fmt(tipAmount, invoiceCurrency)}</b> ({tipPct}%)</>}
                {"  "}•{"  "}Total: <b>{fmt(totalAmount, invoiceCurrency)}</b>
              </div>
            </div>
          </div>

          <div className="row cols-3">
            <div>
              <label className="label">Fiat currency</label>
              <select className="select" value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)} aria-label="Select fiat currency">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="NGN" disabled>NGN (not enabled)</option>
              </select>
            </div>

            <div>
              <label className="label">Crypto to receive</label>
              <select
                className="select"
                value={cryptoCurrency}
                onChange={(e) => setCryptoCurrency(e.target.value)}
                aria-label="Select crypto"
                disabled={loadingCryptos}
              >
                {cryptoOptions.map((c) => (
                  <option key={c.symbol} value={c.symbol}>{c.label}</option>
                ))}
              </select>

              {/* Networks for selected crypto */}
              {networksForSelected.length > 0 && (
                <div className="input-group" style={{ marginTop: 8, flexWrap: "wrap" }}>
                  {networksForSelected.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`btn ${network === n ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setNetwork(n)}
                      aria-label={`Set network ${n}`}
                    >
                      Network: {n}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Payer ID</label>
              <input className="input" type="text" value={payerId} onChange={(e) => setPayerId(e.target.value)} placeholder="walk-in" aria-label="Payer ID" />
            </div>
          </div>

          <div className="row cols-3">
            <div>
              <label className="label">Cashier name</label>
              <input className="input" type="text" value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="Cashier" aria-label="Cashier name" />
            </div>
            <div>
              <label className="label">Customer email (optional)</label>
              <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="you@example.com" aria-label="Customer email" />
            </div>
          </div>

          <div className="input-group" style={{ flexWrap: "wrap" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={starting || !canSubmit}
              aria-label="Create charge"
              title={!isAmountValid ? "Enter at least 0.01" : "Create charge"}
            >
              {starting ? "Creating..." : `Charge ${fmt(totalAmount, invoiceCurrency)}`}
            </button>

            {/* Only show these if we have a real URL */}
            {(() => {
              const url =
                startResult?.access_url || startResult?.checkout_url || startResult?.payment_url || startResult?.url || startResult?.accessUrl || null;
              return url ? (
                <>
                  <button type="button" className="btn btn-outline" onClick={openCheckout} aria-label="Open checkout">
                    Open checkout
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => copyToClipboard(url)} aria-label="Copy checkout link">
                    Copy checkout link
                  </button>
                </>
              ) : null;
            })()}

            <button type="button" className="btn btn-ghost" onClick={resetForm} aria-label="New sale">
              New sale
            </button>
          </div>

          {error && <div className="error" role="alert">⚠️ {error}</div>}

          {startResult && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-body">
                <div><b>Payment ID:</b> {startResult.payment_id || "—"}</div>
                <div><b>Crypto:</b> {cryptoCurrency}{networksForSelected.length ? ` • ${network}` : ""}</div>
                {(() => {
                  const url =
                    startResult?.access_url || startResult?.checkout_url || startResult?.payment_url || startResult?.url || startResult?.accessUrl || null;
                  return url ? (
                    <div className="input-group" style={{ flexWrap: "wrap", marginTop: 8 }}>
                      <div>
                        <b>Checkout URL:</b>{" "}
                        <a href={url} target="_blank" rel="noreferrer">{url}</a>
                      </div>
                    </div>
                  ) : (
                    <div className="hint" style={{ marginTop: 8 }}>
                      No checkout URL returned by gateway.
                    </div>
                  );
                })()}
                <div className="input-group" style={{ flexWrap: "wrap", marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={copyPayload} aria-label="Copy payload">
                    Copy payload
                  </button>
                  {DEBUG && (
                    <details style={{ marginTop: 6 }}>
                      <summary>Response keys (debug)</summary>
                      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12 }}>
                        {Object.keys(startResult || {}).join(", ")}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </form>

      {/* Payments list */}
      <section className="card">
        <div className="card-header">
          <div className="row" style={{ alignItems: "center" }}>
            <h2>Recent payments</h2>
            <div className="input-group" style={{ flexWrap: "wrap" }}>
              <button onClick={fetchPayments} className="btn btn-ghost" disabled={loadingPayments} aria-label="Refresh payments">
                {loadingPayments ? "Refreshing..." : "Refresh"}
              </button>
              <span className="badge">Confirmed: <b style={{ marginLeft: 6 }}>{confirmedCount}</b> • Total: <b style={{ marginLeft: 6 }}>{totalCount}</b></span>
              <span className="badge">Totals (confirmed): <b style={{ marginLeft: 6 }}>{formatTotals(confirmedTotals)}</b></span>
              <button onClick={exportFilteredCsv} className="btn btn-outline" aria-label="Export filtered CSV">Export filtered CSV</button>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="input-group" style={{ flexWrap: "wrap" }}>
              <label className="label" style={{ margin: 0 }}>Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select" aria-label="Filter by status">
                <option value="all">All</option><option value="created">Created</option><option value="waiting">Waiting</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option>
              </select>

              <label className="label" style={{ marginLeft: 8, marginBottom: 0 }}>Cashier</label>
              <select value={filterCashier} onChange={(e) => setFilterCashier(e.target.value)} className="select" aria-label="Filter by cashier">
                <option value="all">All</option>
                {cashierOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <label className="label" style={{ marginLeft: 8, marginBottom: 0 }}>
                <input type="checkbox" checked={onlyToday} onChange={(e) => setOnlyToday(e.target.checked)} style={{ marginRight: 6 }} aria-label="Today only" />
                Today only
              </label>
            </div>

            <div className="input-group" style={{ flexWrap: "wrap" }}>
              <label className="label" style={{ margin: 0 }}>Search</label>
              <input ref={searchRef} className="input" type="text" placeholder="payment id, order id, email, cashier…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search payments" />
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table" aria-busy={loadingPayments}>
              <thead>
                <tr>
                  <th>Created</th><th>Order ID</th><th>Fiat</th><th>Crypto</th><th>Status</th><th>Cashier</th><th>Tip</th><th>Customer email</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayments && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk${i}`}>{Array.from({ length: 9 }).map((__, j) => (<td key={`sk${i}-${j}`}><div className="shimmer skeleton" /></td>))}</tr>
                ))}
                {!loadingPayments && filteredPayments.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--text-dim)" }}>No matching payments.</td></tr>
                )}
                {!loadingPayments && filteredPayments.map((row) => {
                  const state = String(row.state || row.status || "").toLowerCase();
                  const isConfirmed = state === "confirmed";
                  const tipText = fixed2(row.meta_tip_amount)
                    ? `${fixed2(row.meta_tip_amount)} ${row.invoice_currency}${row.meta_tip_percent != null ? ` (${row.meta_tip_percent}%)` : (row.meta_tip_mode ? ` (${row.meta_tip_mode})` : "")}`
                    : "—";
                  return (
                    <React.Fragment key={row.payment_id || row.created_at || Math.random()}>
                      <tr>
                        <td>{row.created_at || "—"}</td>
                        <td>{row.order_id || "—"}</td>
                        <td>{row.invoice_amount ? `${row.invoice_amount} ${row.invoice_currency}` : "—"}</td>
                        <td>{row.crypto_amount ? `${row.crypto_amount} ${row.currency}` : "—"}</td>
                        <td><StatusPill status={row.state || row.status || "—"} /></td>
                        <td>{row.meta_cashier || "—"}</td>
                        <td>{tipText}</td>
                        <td>{row.customer_email || "—"}</td>
                        <td>
                          <div className="input-group" style={{ flexWrap: "wrap" }}>
                            <button onClick={() => openEmailForm(row)} disabled={!row?.payment_id || !isConfirmed} title={!row?.payment_id ? "Unavailable" : !isConfirmed ? "Available after confirmation" : "Send receipt"} className="btn btn-ghost" data-testid="email-btn" aria-label="Email receipt">
                              Email
                            </button>
                            {row?.payment_id && (
                              <a href={`${API_BASE}/receipt/${encodeURIComponent(row.payment_id)}/print`} target="_blank" rel="noreferrer noopener" className="btn btn-outline" aria-label="Print receipt">
                                Print
                              </a>
                            )}
                            <button onClick={() => recheck(row.payment_id)} disabled={!row?.payment_id} className="btn btn-ghost" title="Re-check status with ForumPay" data-testid="recheck-btn" aria-label="Re-check status">
                              Re-check
                            </button>
                            {row?.payment_id && (
                              <button type="button" onClick={() => copyToClipboard(`${API_BASE}/receipt/${encodeURIComponent(row.payment_id)}/print`)} className="btn btn-ghost" title="Copy receipt link" aria-label="Copy receipt link">
                                Copy receipt
                              </button>
                            )}
                            {row?.payment_id && (
                              <button type="button" onClick={() => copyToClipboard(row.payment_id)} className="btn btn-ghost" title="Copy payment ID" aria-label="Copy payment ID">
                                Copy ID
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {emailTargetId === row.payment_id && (
                        <tr>
                          <td colSpan={9}>
                            <div className="input-group" style={{ flexWrap: "wrap" }}>
                              <input className="input" style={{ maxWidth: 360 }} type="email" placeholder="name@example.com" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} data-testid="email-input" aria-label="Email address" />
                              <button type="button" onClick={sendEmail} disabled={sendingEmail || !emailAddress.trim()} className="btn btn-primary" data-testid="email-send" aria-label="Send email">
                                {sendingEmail ? "Sending..." : "Send"}
                              </button>
                              <button type="button" onClick={cancelEmailForm} className="btn btn-ghost" data-testid="email-cancel" aria-label="Cancel email">
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
        </div>
      </section>

      {/* Daily report */}
      <section className="card">
        <div className="card-header"><h2>Daily report</h2></div>
        <div className="card-body input-group" style={{ flexWrap: "wrap" }}>
          <input className="input" type="date" id="reportDate" defaultValue={todayISO()} aria-label="Daily report date" />
          <button type="button" onClick={() => { const d = document.getElementById("reportDate").value; window.open(`${API_BASE}/report/daily?date=${d}`, "_blank"); }} className="btn btn-ghost" aria-label="View daily report JSON">View JSON</button>
          <button type="button" onClick={() => { const d = document.getElementById("reportDate").value; window.open(`${API_BASE}/report/daily.csv?date=${d}`, "_blank"); }} className="btn btn-outline" aria-label="Download daily report CSV">Download CSV</button>
        </div>
      </section>

      {/* Range report */}
      <section className="card">
        <div className="card-header"><h2>Range report</h2></div>
        <div className="card-body">
          <div className="input-group" style={{ flexWrap: "wrap" }}>
            <div className="input-group">
              <label className="label" style={{ margin: 0 }}>Start</label>
              <input className="input" type="date" id="rangeStart" defaultValue={monthStartISO()} aria-label="Range start" />
            </div>
            <div className="input-group">
              <label className="label" style={{ margin: 0 }}>End</label>
              <input className="input" type="date" id="rangeEnd" defaultValue={todayISO()} aria-label="Range end" />
            </div>
            <button type="button" onClick={() => {
              const s = document.getElementById("rangeStart").value;
              const e = document.getElementById("rangeEnd").value;
              if (!s || !e) return alert("Pick start and end dates.");
              if (s > e) return alert("Start must be before End.");
              window.open(`${API_BASE}/report/range?start=${s}&end=${e}`, "_blank");
            }} className="btn btn-ghost" aria-label="View range report JSON">View JSON</button>
            <button type="button" onClick={() => {
              const s = document.getElementById("rangeStart").value;
              const e = document.getElementById("rangeEnd").value;
              if (!s || !e) return alert("Pick start and end dates.");
              if (s > e) return alert("Start must be before End.");
              window.open(`${API_BASE}/report/range.csv?start=${s}&end=${e}`, "_blank");
            }} className="btn btn-outline" aria-label="Download range report CSV">Download CSV</button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Dates are inclusive; timezone based on server.</div>
        </div>
      </section>

      {/* PIN gate overlay */}
      {needsPinFor && (
        <PinGate
          onUnlock={() => {
            if (needsPinFor === "admin") { setAdminUnlocked(true); setShowAdmin(true); }
            else if (needsPinFor === "settings") { setSettingsUnlocked(true); setShowSettings(true); }
            setNeedsPinFor(null);
          }}
          onClose={() => setNeedsPinFor(null)}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          close={() => setShowSettings(false)}
          quickAmts={quickAmts} setQuickAmts={setQuickAmts}
          tipPresets={tipPresets} setTipPresets={setTipPresets}
          beepOn={beepOn} setBeepOn={setBeepOn}
          autoOpenCheckout={autoOpenCheckout} setAutoOpenCheckout={setAutoOpenCheckout}
          invoiceCurrency={invoiceCurrency} setInvoiceCurrency={setInvoiceCurrency}
          cryptoCurrency={cryptoCurrency} setCryptoCurrency={setCryptoCurrency}
          network={network} setNetwork={setNetwork}
          cryptoOptions={cryptoOptions}
          networksForSelected={networksForSelected}
          onResetAmts={() => setQuickAmts(DEFAULT_AMTS)}
          onResetTips={() => setTipPresets(DEFAULT_TIPS)}
        />
      )}
    </div>
  );
}

/* Settings Modal */
function SettingsModal({
  close,
  quickAmts, setQuickAmts,
  tipPresets, setTipPresets,
  beepOn, setBeepOn,
  autoOpenCheckout, setAutoOpenCheckout,
  invoiceCurrency, setInvoiceCurrency,
  cryptoCurrency, setCryptoCurrency,
  network, setNetwork,
  cryptoOptions,
  networksForSelected,
  onResetAmts, onResetTips,
}) {
  const [amtsText, setAmtsText] = useState(quickAmts.join(", "));
  const [tipsText, setTipsText] = useState(tipPresets.join(", "));
  const [pinText, setPinText] = useState("");

  function save() {
    const amts = amtsText.split(",").map(s => Number(safeNum(s.trim())).toFixed(2)).filter(x => Number(x) > 0);
    const tips = tipsText.split(",").map(s => parseInt(String(s).trim(), 10)).filter(n => Number.isFinite(n));
    if (amts.length) setQuickAmts(amts);
    if (tips.length) setTipPresets(tips);
    if (pinText.trim()) localStorage.setItem("adminPin", pinText.trim());
    close();
  }

  return (
    <div
      className="modalOverlay"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
      onClick={close}
    >
      <div className="card" style={{ width: "min(720px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header"><h2>Settings</h2></div>
        <div className="card-body row">
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Quick amounts</div>
            <input className="input" value={amtsText} onChange={(e) => setAmtsText(e.target.value)} placeholder="e.g. 5, 10, 20, 50" />
            <div className="hint">Comma-separated; shown as quick buttons under Amount.</div>
            <div style={{ marginTop: 6 }}>
              <button className="btn btn-ghost" type="button" onClick={() => { onResetAmts?.(); setAmtsText(["5.00","10.00","20.00","50.00"].join(", ")); }}>
                Reset to defaults
              </button>
            </div>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>Tip presets (%)</div>
            <input className="input" value={tipsText} onChange={(e) => setTipsText(e.target.value)} placeholder="e.g. 0, 10, 15, 20" />
            <div className="hint">Comma-separated percentages; used for tip buttons.</div>
            <div style={{ marginTop: 6 }}>
              <button className="btn btn-ghost" type="button" onClick={() => { onResetTips?.(); setTipsText([0,10,15,20].join(", ")); }}>
                Reset to defaults
              </button>
            </div>
          </div>

          <div className="row cols-3">
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Default fiat</div>
              <select className="select" value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)}>
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                <option value="NGN" disabled>NGN (not enabled)</option>
              </select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Default crypto</div>
              <select className="select" value={cryptoCurrency} onChange={(e) => setCryptoCurrency(e.target.value)}>
                {cryptoOptions.map((c) => <option key={c.symbol} value={c.symbol}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 6 }}>Default network</div>
              {networksForSelected.length > 0 ? (
                <div className="input-group">
                  {networksForSelected.map((n) => (
                    <button key={n} type="button" className={`btn ${network === n ? "btn-primary" : "btn-ghost"}`} onClick={() => setNetwork(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="hint">No network selection required for {cryptoCurrency}.</div>
              )}
            </div>
          </div>

          <label className="label" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={beepOn} onChange={(e) => setBeepOn(e.target.checked)} /> Sound on confirmation
          </label>

          <label className="label" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={autoOpenCheckout} onChange={(e) => setAutoOpenCheckout(e.target.checked)} /> Auto-open checkout after creating payment
          </label>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>Admin PIN</div>
            <input className="input" type="password" placeholder="Enter new PIN (leave blank to keep)" value={pinText} onChange={(e) => setPinText(e.target.value)} />
            <div className="hint">Default is 0000. Changing it updates this browser/device.</div>
          </div>
        </div>

        <div className="card-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* Helpers */
function safeNum(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round(n * 100) / 100; }
function fmt(n, ccy) { const s = Number.isFinite(n) ? n.toFixed(2) : "0.00"; return `${s} ${ccy}`; }
function fixed2(v) { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : null; }
function toFixedOrEmpty(v) { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : ""; }
function isConfirmedRow(row) { return String(row?.state || row?.status || "").toLowerCase() === "confirmed"; }
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
function csvEscape(x) { const s = String(x ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
async function requestNotify() {
  try {
    if (!("Notification" in window)) return alert("Notifications not supported");
    if (Notification.permission === "granted") return alert("Notifications already enabled");
    const p = await Notification.requestPermission();
    alert(p === "granted" ? "Notifications enabled" : "Notifications not enabled");
  } catch {}
}
function notify(title, body) { try { if (!("Notification" in window) || Notification.permission !== "granted") return; new Notification(title, { body }); } catch {} }
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
  try { await navigator.clipboard.writeText(text); alert("Copied to clipboard"); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copied to clipboard");
  }
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() {
  const d = new Date();
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return s.toISOString().slice(0, 10);
}
