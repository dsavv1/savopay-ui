import { FALLBACK } from '../lib/supportedFallback';

const norm = (data = {}) => {
  const fiats = data.fiat || data.fiats || [];
  const assetsRaw = data.crypto || data.assets || [];
  const assets = (assetsRaw || []).map(a => ({
    symbol: String(a.symbol || a.currency || a.code || '').toUpperCase(),
    networks: (a.networks || a.chains || a.network || []).map(n => String(n).toUpperCase())
  })).filter(x => x.symbol);

  const fiatSet = new Set([...fiats.map(x => String(x).toUpperCase()), ...FALLBACK.fiat]);
  const map = new Map();
  const add = arr => arr.forEach(a => {
    const k = a.symbol.toUpperCase();
    const nets = new Set((a.networks || []).map(n => String(n).toUpperCase()));
    if (map.has(k)) { for (const n of map.get(k)) nets.add(n); }
    map.set(k, nets);
  });
  add(assets); add(FALLBACK.crypto);

  return { fiat: [...fiatSet], crypto: [...map.entries()].map(([symbol, nets]) => ({ symbol, networks: [...nets] })) };
};

const should = (url) => /\/meta\/supported(?:\?|$)/.test(url);

(function(){
  if (window.__SVP_SUPPORTED_BRIDGED__) return;
  window.__SVP_SUPPORTED_BRIDGED__ = true;
  const orig = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (should(url)) {
      try {
        const r = await orig(input, init);
        if (r && r.ok) {
          const json = await r.clone().json().catch(() => ({}));
          const merged = norm(json || {});
          return new Response(JSON.stringify(merged), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      } catch(e) {}
      const merged = norm({});
      return new Response(JSON.stringify(merged), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(input, init);
  };
})();
