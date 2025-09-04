import { useEffect, useMemo, useState } from 'react';

const API = process.env.REACT_APP_API_BASE || '';
const BUILD_TAG = process.env.REACT_APP_UI_BUILD || 'dev';

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  let cls = 'px-2 py-1 rounded-full text-xs font-medium';
  if (['confirmed','paid','success'].includes(s)) cls += ' bg-green-100 text-green-700';
  else if (['pending','processing'].includes(s)) cls += ' bg-amber-100 text-amber-700';
  else if (['expired','cancelled','failed'].includes(s)) cls += ' bg-rose-100 text-rose-700';
  else cls += ' bg-gray-100 text-gray-700';
  return <span className={cls}>{status || '—'}</span>;
}

export default function App() {
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('today');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fetchPayments = async () => {
    const q = new URLSearchParams();
    if (filter === 'today') q.set('today', '1');
    const r = await fetch(`${API}/payments?${q.toString()}`, { credentials: 'omit' });
    if (!r.ok) throw new Error('Failed to fetch payments');
    return r.json();
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPayments()
      .then(d => alive && setPayments(d.payments || []))
      .catch(e => alive && setErr(e.message || 'Error'))
      .finally(() => alive && setLoading(false));
    const id = setInterval(() => {
      fetchPayments().then(d => alive && setPayments(d.payments || [])).catch(()=>{});
    }, 4000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line
  }, [filter]);

  const rows = useMemo(() => (payments || []).map(p => ({
    id: p.payment_id || p.id,
    amount: p.invoice_amount ? `${p.invoice_amount} ${p.invoice_currency}` : '',
    asset: p.currency ? `${p.currency}${p.network ? ' · ' + p.network : ''}` : '',
    status: p.status || p.payment_status || '',
    created: p.created_at || p.created || ''
  })), [payments]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>SavoPay POS</h1>
        <div className="build">{`UI build: ${BUILD_TAG}`}</div>
      </header>

      <section className="toolbar">
        <div className="left">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="today">Today</option>
            <option value="all">All</option>
          </select>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
        <div className="right">
          {loading ? <span className="muted">Loading…</span> : err ? <span className="error">{err}</span> : <span className="muted">Auto-refreshing</span>}
        </div>
      </section>

      <section className="card">
        <div className="table">
          <div className="thead">
            <div>ID</div>
            <div>Amount</div>
            <div>Asset</div>
            <div>Status</div>
            <div>Created</div>
          </div>
          <div className="tbody">
            {rows.map(r => (
              <div key={r.id} className="tr">
                <div className="cell mono">{r.id}</div>
                <div className="cell">{r.amount}</div>
                <div className="cell">{r.asset}</div>
                <div className="cell"><StatusPill status={r.status} /></div>
                <div className="cell">{r.created}</div>
              </div>
            ))}
            {!rows.length && <div className="tr empty">No payments</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
