// src/components/StatusPill.js
import React from 'react';
import { statusStyle } from '../utils/status';

export default function StatusPill({ status }) {
  const st = statusStyle(status);
  return (
    <span style={st}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: st.color,
          opacity: 0.8,
        }}
      />
      {(status || '—').toUpperCase()}
    </span>
  );
}
