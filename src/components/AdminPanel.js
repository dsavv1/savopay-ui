import React, { useEffect, useMemo, useState } from "react";

const LS_KEY = "svp_admin_b64";

export default function AdminPanel({ apiBase, styles }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  // If a token is remembered from a previous session, use it
  const [storedToken, setStoredToken] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; }
  });
  const [remember, setRemember] = useState(!!storedToken);

  const typedToken = useMemo(() => {
    if (!user || !pass) return "";
    try { return btoa(`${user}:${pass}`); } catch { return ""; }
  }, [user, pass]);

  const effectiveToken = typedToken || storedToken;
  const authHeader = effectiveToken ? { Authorization: `Basic ${effectiveToken}` } : {};

  // Default date range: past 7 days
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  const [events, setEvents] = useState([]);
  const [rangeJson, setRangeJson] = useState(null);

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  // Persist or clear remembered token
  useEffect(() => {
    try {
      if (remember && typedToken) {
        localStorage.setItem(LS_KEY, typedToken);
        setStoredToken(typedToken);
      } else if (!remember) {
        localStorage.removeItem(LS_KEY);
        setStoredToken("");
      }
    } catch {}
  }, [remember, typedToken]);

  // Auto-refresh webhook events when enabled
  useEffect(() => {
    if (!autoRefresh || !effectiveToken) return;
    const id = setInterval(() => loadEvents(true), 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, effectiveToken]);

  function clearRemembered() {
    try { localStorage.removeItem(LS_KEY); } catch {}
    setStoredToken("");
    setRemember(false);
    setNote("Stored token cleared on this device.");
    setTimeout(() => setNote(""), 2500);
  }

  async function loadEvents(silent = false) {
    if (!effectiveToken) return setErr("Enter admin username & password or enable 'Remember on this device'.");
    if (!silent) setErr("");
    if (!silent) setLoadingEvents(true);
    try {
      const r = await fetch(`${apiBase}/admin/webhook-events?limit=100`, { headers: authHeader });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      if (!silent) setLoadingEvents(false);
    }
  }

  async function viewRangeJson() {
    if (!effectiveToken) return setErr("Enter admin username & password first.");
    setErr("");
    setLoadingRange(true);
    try {
      const r = await fetch(`${apiBase}/report/range?from=${from}&to=${to}`, { headers: authHeader });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setRangeJson(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoadingRange(false);
    }
  }

  async function downloadRangeCsv() {
    if (!effectiveToken) return setErr("Enter admin username & password first.");
    setErr("");
    try {
      const r = await fetch(`${apiBase}/report/range.csv?from=${from}&to=${to}`, { headers: authHeader });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `savopay_report_${from}_to_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function recheckPending() {
    if (!effectiveToken) return setErr("Enter admin username & password first.");
    setErr("");
    setRechecking(true);
    try {
      const r = await fetch(`${apiBase}/admin/recheck-pending`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      setNote(`Rechecked ${data.checked ?? 0} pending payments.`);
      setTimeout(() => setNote(""), 2500);
      // refresh events to reflect updates
      loadEvents(true);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="admin-panel">
      <section style={styles.card}>
        <h2 style={styles.h2}>Admin credentials</h2>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "160px 1fr", alignItems: "center", marginTop: 8 }}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="admin"
            autoComplete="username"
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ transform: "scale(1.1)" }}
            />
            Remember on this device
          </label>
          {storedToken && (
            <button type="button" onClick={clearRemembered} style={styles.secondaryBtn}>
              Clear stored token
            </button>
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ transform: "scale(1.1)" }}
              disabled={!effectiveToken}
            />
            Auto-refresh events (10s)
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={styles.secondaryBtn}
            onClick={() => loadEvents(false)}
            disabled={!effectiveToken || loadingEvents}
          >
            {loadingEvents ? "Loading events..." : "Load webhook events"}
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={recheckPending}
            disabled={!effectiveToken || rechecking}
            title="Re-check older pending payments via ForumPay"
          >
            {rechecking ? "Rechecking..." : "Recheck older pending"}
          </button>
        </div>
        {err && <div style={styles.error} data-testid="admin-error">⚠️ {err}</div>}
        {note && <div style={{ marginTop: 8, color: "#166534", fontWeight: 600 }} data-testid="admin-note">✓ {note}</div>}
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>Date range report (no auth prompt)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input style={styles.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>to</span>
          <input style={styles.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button style={styles.secondaryBtn} onClick={viewRangeJson} disabled={!effectiveToken || loadingRange}>
            {loadingRange ? "Fetching..." : "View JSON"}
          </button>
          <button style={styles.secondaryBtn} onClick={downloadRangeCsv} disabled={!effectiveToken}>
            Download CSV
          </button>
        </div>
        {rangeJson && (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#374151", marginBottom: 6 }}>
              <b>From:</b> {rangeJson.from} &nbsp; <b>To:</b> {rangeJson.to} &nbsp; <b>Count:</b> {rangeJson.count}
            </div>
            <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, background: "#f9fafb" }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Created</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Payment ID</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Fiat</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeJson.rows?.slice(0, 200).map((r) => (
                    <tr key={r.payment_id + (r.created_at || "")}>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>{r.created_at || "—"}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, Menlo, monospace" }}>{r.payment_id}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>
                        {r.invoice_amount ? `${r.invoice_amount} ${r.invoice_currency}` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>{r.state || r.status || "—"}</td>
                    </tr>
                  ))}
                  {!rangeJson.rows?.length && (
                    <tr>
                      <td colSpan={4} style={{ padding: 12, textAlign: "center", color: "#6b7280" }}>
                        No rows.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rangeJson.rows?.length > 200 && (
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>Showing first 200 rows.</div>
            )}
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>Webhook events</h2>
        <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f9fafb" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Time</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Payment ID</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Status</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Error</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Payload (preview)</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={(e.id || e.payment_id || Math.random()) + (e.created_at || "")}>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>{e.created_at || "—"}</td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {e.payment_id || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>{e.status || "—"}</td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", color: e.error ? "#b91c1c" : "#374151" }}>
                    {e.error ? String(e.error).slice(0, 120) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, Menlo, monospace", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", maxWidth: 360 }}>
                    {e.payload ? JSON.stringify(e.payload).slice(0, 160) : "—"}
                  </td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, textAlign: "center", color: "#6b7280" }}>
                    No events loaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
