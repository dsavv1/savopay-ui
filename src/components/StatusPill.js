// src/components/StatusPill.js
import React from "react";

export default function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const { bg, text, brd, label } = styleFor(s);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: bg,
      color: text,
      border: `1px solid ${brd}`,
      lineHeight: 1
    }}>
      <Dot color={text} />
      {label}
    </span>
  );
}

function Dot({ color }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: color,
        display: "inline-block"
      }}
    />
  );
}

function styleFor(s) {
  if (s === "confirmed") return chip("#ecfdf5", "#065f46", "#a7f3d0", "Confirmed");
  if (s === "waiting")   return chip("#fff7ed", "#9a3412", "#fed7aa", "Waiting");
  if (s === "created")   return chip("#eef2ff", "#3730a3", "#c7d2fe", "Created");
  if (s === "cancelled") return chip("#fef2f2", "#991b1b", "#fecaca", "Cancelled");
  return chip("#f3f4f6", "#374151", "#e5e7eb", s ? s[0].toUpperCase()+s.slice(1) : "—");
}

function chip(bg, text, brd, label) { return { bg, text, brd, label }; }
