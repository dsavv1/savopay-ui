// src/components/PinGate.js
import React, { useState, useEffect, useRef } from "react";

export default function PinGate({ onUnlock, onClose }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function checkPin() {
    const saved = localStorage.getItem("adminPin") || "14529863";
    if (pin === saved) {
      setError("");
      onUnlock?.();
    } else {
      setError("Incorrect PIN");
      setPin("");
      inputRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter") checkPin();
    if (e.key === "Escape") onClose?.();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Enter Admin PIN</h3>
        <div style={{ color: "#6b7280", fontSize: 12, margin: "6px 0 12px" }}>
          Default is <b>0000</b>. You can change it in Settings.
        </div>
        <input
          ref={inputRef}
          style={styles.input}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKey}
          maxLength={8}
        />
        {error && <div style={styles.error}>⚠️ {error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={styles.primaryBtn} onClick={checkPin}>Unlock</button>
          <button style={styles.secondaryBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.35)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60
  },
  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
    width: 360, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,.2)"
  },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db" },
  error: { marginTop: 8, color: "#b91c1c", fontWeight: 600, fontSize: 13 },
  primaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" },
  secondaryBtn: { padding: "10px 14px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", cursor: "pointer" },
};
