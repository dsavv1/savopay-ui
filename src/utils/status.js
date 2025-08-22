// src/utils/status.js
export function statusStyle(status) {
  const s = String(status || '').toLowerCase();
  const base = {
    border: '1px solid',
    borderRadius: 999,
    padding: '4px 10px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
  };

  switch (s) {
    case 'completed':
      return { ...base, backgroundColor: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }; // green
    case 'confirmed':
      return { ...base, backgroundColor: '#e0f2fe', color: '#075985', borderColor: '#bae6fd' }; // blue
    case 'pending':
      return { ...base, backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }; // amber
    case 'failed':
    case 'expired':
      return { ...base, backgroundColor: '#ffe4e6', color: '#9f1239', borderColor: '#fecdd3' }; // rose/red
    default:
      return { ...base, backgroundColor: '#f4f4f5', color: '#3f3f46', borderColor: '#e4e4e7' }; // gray
  }
}
