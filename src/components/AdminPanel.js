// src/components/AdminPanel.js
import React, { useEffect, useMemo, useState } from "react";

export default function AdminPanel({ apiBase }) {
  const [adminUser, setAdminUser] = useState(() => sessionStorage.getItem("adm_u") || "");
  const [adminPass, setAdminPass] = useState(() => sessionStorage.getItem("adm_p") || "");
  const [remember, setRemember] = useState(() => !!(sessionStorage.getItem("adm_u") || sessionStorage.getItem("adm_p")));
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const authHeader = useMemo(() => {
    if (!adminUser || !adminPass) return null;
    try { return "Basic " + btoa(`${adminUser}:${adminPass}`); } catch { return null; }
  }, [adminUser, adminPass]);

  function saveCreds() {
    sessionStorage.setItem("adm_u", remember ? adminUser : "");
    sessionStorage.setItem("adm_p", remember ? adminPass : "");
  }
  function clearCreds() {
    setAdminUser("");
    setAdminPass("");
    setRemember(false);
    sessionStorage.removeItem("adm_u");
    sessionStorage.removeItem("adm_p");
  }

  async function fetchHealth() {
    try {
      setError("");
      setHealthLoading(true);
      const r = await fetch(`${apiBase}/api/health`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!r.ok) throw new Error(json?.error || json?.detail || `HTTP ${r.status}`);
      setHealth(json);
    } catch (e) {
      setHealth(null);
      setError(String(e.message || e));
    } finally {
      setHealthLoading(false);
    }
  }

  async function fetchWebhookEvents() {
    try {
      setError("");
      setEventsLoading(true);
      const r = await fetch(`${apiBase}/admin/webhook-events?limit=${encodeURIComponent(limit)}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!r.ok) throw new Error(json?.error || json?.detail || `HTTP ${r.status}`);
      const arr = Array.isArray(json?.events) ? json.events : (Array.isArray(json) ? json : []);
      setEvents(arr);
    } catch (e) {
      setEvents([]);
      setError(String(e.message || e));
    } finally {
      setEventsLoading(false);
    }
  }

  useEffect(() => {
    if (adminUser && adminPass) {
      fetchHealth();
      fetchWebhookEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return events;
    const q = query.trim().toLowerCase();
    return events.filter((ev) => JSON.stringify(ev).toLowerCase().includes(q));
  }, [events, query]);

  function exportCsv() {
    try {
      const rows = filtered.map((e) => {
        const created = first(e, "created_at", "received_at", "timestamp", "ts", "time") || "";
        const method = first(e, "method", "http_method") || "";
        const path = first(e, "path", "request_path", "url", "endpoint") || "";
        const status = first(e, "status", "http_status", "code") ?? "";
        const type = first(e, "type", "event", "event_type") || "";
        const token = first(e, "token_valid", "valid", "ok");
        const id = first(e, "id", "event_id", "payment_id", "webhook_id") || "";
        return [created, method, path, status, type, token == null ? "" : String(token), id, jsonPreview(e, 200)];
      });
      const headers = ["created_at","method","path","status","type","token_valid","id","preview"];
      const csv = [headers, ...rows].map(cols => cols.map(csvEscape).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `webhook_events_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export CSV");
    }
  }

  return (
    <div>
      <div style={styles.sectionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={styles.h2}>Admin Console</span>
          <span style={styles.badge}>{apiBase}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={styles.secondaryBtn} onClick={saveCreds}>Use creds</button>
          <button style={styles.secondaryBtn} onClick={clearCreds}>Clear creds</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={styles.input} type="text" placeholder="Admin user" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Admin password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember in this session
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={styles.primaryBtn} onClick={fetchHealth} disabled={healthLoading || !adminUser || !adminPass}>
            {healthLoading ? "Checking health..." : "Ping /api/health"}
          </button>
          <button style={styles.primaryBtn} onClick={fetchWebhookEvents} disabled={eventsLoading || !adminUser || !adminPass}>
            {eventsLoading ? "Loading events..." : `Load webhook events (limit ${limit})`}
          </button>
          <input style={{ ...styles.input, width: 120 }} type="number" min="1" max="500" value={limit} onChange={(e) => setLimit(parseInt(e.target.value || "50", 10) || 50)} />
          <input style={{ ...styles.input, minWidth: 220 }} type="text" placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button style={styles.secondaryBtn} onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
        </div>
      </div>

      {error && <div style={styles.error}>⚠️ {error}</div>}

      <section style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.sectionHeader}>
          <span style={styles.h3}>Health</span>
          <span style={styles.kv}>
            <b>Status:</b>{" "}
            <span style={{
              ...styles.pill,
              background: healthOk(health) ? "#ecfdf5" : "#fef2f2",
              color: healthOk(health) ? "#065f46" : "#991b1b",
              borderColor: healthOk(health) ? "#a7f3d0" : "#fecaca"
            }}>
              {healthOk(health) ? "OK" : "Unknown"}
            </span>
          </span>
        </div>
        <pre style={styles.pre}>{health ? pretty(health) : "—"}</pre>
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <span style={styles.h3}>Webhook events</span>
          <span style={styles.kv}><b>Showing:</b> {filtered.length} of {events.length}</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Created</th>
                <th>Type</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Token OK</th>
                <th>ID</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "#666" }}>No events</td></tr>
              ) : filtered.map((e, i) => {
                const created = first(e, "created_at","received_at","timestamp","ts","time") || "—";
                const method = first(e, "method","http_method") || "—";
                const path = first(e, "path","request_path","url","endpoint") || "—";
                const status = first(e, "status","http_status","code");
                const type = first(e, "type","event","event_type") || "—";
                const token = first(e, "token_valid","valid","ok");
                const id = first(e, "id","event_id","payment_id","webhook_id") || "—";
                return (
                  <tr key={String(id) + i}>
                    <td>{created}</td>
                    <td>{type}</td>
                    <td>{method}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</td>
                    <td>{status == null ? "—" : String(status)}</td>
                    <td>{token == null ? "—" : String(!!token)}</td>
                    <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</td>
                    <td title={jsonPreview(e, 2000)} style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {jsonPreview(e, 200)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function first(obj, ...keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return null;
}
function pretty(x) {
  try { return JSON.stringify(x, null, 2); } catch { return String(x); }
}
function jsonPreview(x, n = 160) {
  try {
    const s = JSON.stringify(x);
    return s.length > n ? s.slice(0, n) + "…" : s;
  } catch { return String(x).slice(0, n); }
}
function csvEscape(x) {
  const s = String(x ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function healthOk(h) {
  if (!h) return false;
  if (h.ok === true) return true;
  if (typeof h.status === "string" && h.status.toLowerCase() === "ok") return true;
  if (typeof h.status === "number" && h.status === 200) return true;
  return false;
}

const styles = {
  card: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  h2: { fontSize: 18, fontWeight: 800 },
  h3: { fontSize: 16, fontWeight: 800 },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" },
  primaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  secondaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer" },
  error: { margin: "12px 0", color: "#b91c1c", fontWeight: 600 },
  pre: { margin: 0, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, maxHeight: 320, overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  badge: { fontSize: 12, color: "#374151", border: "1px solid #e5e7eb", padding: "4px 8px", borderRadius: 999 },
  kv: { fontSize: 13, color: "#374151" },
  pill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 999, border: "1px solid" },
};
