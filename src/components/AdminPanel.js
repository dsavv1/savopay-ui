import React, { useMemo, useState } from "react";

export default function AdminPanel({ apiBase, styles }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const token = useMemo(() => {
    if (!user || !pass) return "";
    try { return btoa(`${user}:${pass}`); } catch { return ""; }
  }, [user, pass]);

  const authHeader = token ? { Authorization: `Basic ${token}` } : {};

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);

  const [events, setEvents] = useState([]);
  const [rangeJson, setRangeJson] = useState(null);

  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  const [err, setErr] = useState("");

  async function loadEvents() {
    if (!token) return setErr("Enter admin username & password first.");
    setErr("");
    setLoadingEvents(true);
    try {
      const r = await fetch(`${apiBase}/admin/webhook-events?limit=100`, {
        headers: authHeader,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoadingEvents(false);
    }
  }

  async function viewRangeJson() {
    if (!token) return setErr("Enter admin username & password first.");
    setErr("");
    setLoadingRange(true);
    try {
      const r = await fetch(
        `${apiBase}/report/range?from=${from}&to=${to}`,
        { headers: authHeader }
      );
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
    if (!token) return setErr("Enter admin username & password first.");
    setErr("");
    try {
      const r = await fetch(
        `${apiBase}/report/range.csv?from=${from}&to=${to}`,
        { headers: authHeader }
      );
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
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={styles.secondaryBtn}
            onClick={loadEvents}
            disabled={!token || loadingEvents}
          >
            {loadingEvents ? "Loading events..." : "Load webhook events"}
          </button>
        </div>
        {err && <div style={styles.error}>⚠️ {err}</div>}
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>Date range report (no auth prompt)</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input
            style={styles.input}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>to</span>
          <input
            style={styles.input}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            style={styles.secondaryBtn}
            onClick={viewRangeJson}
            disabled={!token || loadingRange}
          >
            {loadingRange ? "Fetching..." : "View JSON"}
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={downloadRangeCsv}
            disabled={!token}
          >
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
                    <tr key={r.payment_id + r.created_at}>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>{r.created_at || "—"}</td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {r.payment_id}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>
                        {r.invoice_amount ? `${r.invoice_amount} ${r.invoice_currency}` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>
                        {r.state || r.status || "—"}
                      </td>
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
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                Showing first 200 rows.
              </div>
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
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>
                    {e.created_at || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {e.payment_id || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee" }}>
                    {e.status || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", color: e.error ? "#b91c1c" : "#374151" }}>
                    {e.error ? String(e.error).slice(0, 120) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", borderTop: "1px solid #eee", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", maxWidth: 360 }}>
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
