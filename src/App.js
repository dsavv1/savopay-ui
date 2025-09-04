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
  const [amount, setAmount] = useState('');
  const [fiat, setFiat] = useState('USD');
  const [asset, setAsset] = useState('USDT');
  const [network, setNetwork] = useState('TRON');
  const [supported, setSupported] = useState({ fiat: ['USD','NGN','GBP','EUR'], crypto: [{symbol:'USDT', networks:['TRON','ERC20','BEP20']}, {symbol:'BTC', networks:['BTC']}] });

  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('today');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/meta/supported`);
        if (r.ok) {
          const d = await r.json();
          const fiats = d?.fiat || d?.fiats || supported.fiat;
          const cryptos = (d?.crypto || d?.assets || []).map(a => ({
            symbol: a.symbol || a.currency || a.code || 'USDT',
            networks: a.networks || a.chains || ['TRON','ERC20']
          }));
          if (fiats?.length) setFiat(fiats.includes('USD') ? 'USD' : fiats[0]);
          if (cryptos?.length) {
            setAsset(cryptos[0].symbol);
            setNetwork((cryptos[0].networks || [])[0] || 'TRON');
          }
          if (fiats?.length || cryptos?.length) setSupported({ fiat: fiats?.length ? fiats : supported.fiat, crypto: cryptos?.length ? cryptos : supported.crypto });
        }
      } catch (_) {}
    })();
    // eslint-disable-next-line
  }, []);

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

  const networksForAsset = useMemo(() => {
    const found = supported.crypto.find(c => c.symbol === asset);
    return found?.networks || ['TRON','ERC20'];
  }, [supported, asset]);

  useEffect(() => {
    if (!networksForAsset.includes(network)) setNetwork(networksForAsset[0]);
  }, [networksForAsset, network]);

  const charge = async () => {
    setErr(''); setMsg('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr('Enter an amount'); return; }
    try {
      const payload = {
        invoice_amount: amt,
        invoice_currency: fiat,
        currency: asset,
        network
      };
      const r = await fetch(`${API}/start-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(d?.err || 'Failed to start payment');
      const openUrl = d.checkout_url || d.payment_url || d.url || d?.data?.url;
      if (openUrl) window.open(openUrl, '_blank', 'noopener');
      setMsg('Checkout opened');
      setAmount('');
    } catch (e) {
      setErr(e.message || 'Error starting payment');
    }
  };

  const quick = (v) => setAmount(String((Number(amount)||0) + v));

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>SavoPay POS</h1>
        <div className="build">{`UI build: ${BUILD_TAG}`}</div>
      </header>

      <section className="card" style={{marginBottom:12}}>
        <div style={{display:'grid', gap:8, gridTemplateColumns:'1fr 140px 140px 160px 120px'}}>
          <input type="number" placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} />
          <select value={fiat} onChange={e=>setFiat(e.target.value)}>
            {supported.fiat.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={asset} onChange={e=>setAsset(e.target.value)}>
            {supported.crypto.map(c => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
          </select>
          <select value={network} onChange={e=>setNetwork(e.target.value)}>
            {networksForAsset.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={charge}>Charge</button>
        </div>
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button onClick={()=>quick(5)}>+5</button>
          <button onClick={()=>quick(10)}>+10</button>
          <button onClick={()=>quick(20)}>+20</button>
          <button onClick={()=>quick(50)}>+50</button>
          <button onClick={()=>setAmount('')}>Clear</button>
          {msg && <span className="muted">{msg}</span>}
          {err && <span className="error">{err}</span>}
        </div>
      </section>

      <section className="toolbar">
        <div className="left">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="today">Today</option>
            <option value="all">All</option>
          </select>
          <button onClick={()=>window.location.reload()}>Refresh</button>
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
