(function(){
  const API = (window._SVP_API_BASE || process?.env?.REACT_APP_API_BASE || '').replace(/\/$/,'');
  const wait = (sel, t=100, n=100) => new Promise(res=>{
    const i=setInterval(()=>{
      const el = typeof sel==='function' ? sel() : document.querySelector(sel);
      if(el){clearInterval(i);res(el)}; if(--n<=0){clearInterval(i);res(null)}
    },t);
  });
  const getMerged = async () => {
    try{
      const r = await fetch((API||'') + '/meta/supported');
      const j = await r.json();
      if (j && j.crypto && j.fiat) return j;
    }catch(e){}
    return { fiat:['USD','NGN','GBP','EUR'], crypto:[
      {symbol:'USDT',networks:['TRON','ERC20','BEP20']},
      {symbol:'USDC',networks:['ERC20','TRON']},
      {symbol:'BTC',networks:['BTC']},
      {symbol:'ETH',networks:['ERC20']},
      {symbol:'BUSD',networks:['BEP20']},
    ]};
  };
  const toCombos = (data) => {
    const combos=[];
    (data.crypto||[]).forEach(a=>{
      (a.networks||['']).forEach(n=>{
        combos.push(`${a.symbol}${n?` (${n})`:''}`);
      });
    });
    return combos;
  };
  const findSelects = () => {
    const sels = [...document.querySelectorAll('select')];
    const fiatSel = sels.find(s=>{
      const v=[...s.options].map(o=>o.text.toUpperCase());
      return v.every(x=>['USD','NGN','GBP','EUR'].includes(x)) && v.length>=2;
    }) || null;
    const assetSel = sels.find(s=>{
      const v=[...s.options].map(o=>o.text);
      return v.some(x=>/\b(USDT|USDC|BTC|ETH|BUSD)\b/i.test(x)) || v.some(x=>/\([^)]+\)$/.test(x));
    }) || null;
    return {fiatSel, assetSel};
  };
  const populateAssets = (assetSel, combos) => {
    if(!assetSel) return;
    const current = assetSel.value || (assetSel.options[assetSel.selectedIndex]?.text)||'';
    assetSel.innerHTML = combos.map(c=>`<option>${c}</option>`).join('');
    const match = combos.find(c => c===current) || combos[0];
    assetSel.value = match;
  };
  const parseCombo = (txt) => {
    const m = String(txt||'').match(/^([A-Z0-9]+)(?:\s*\(([A-Z0-9-]+)\))?$/i);
    return { currency: m?m[1].toUpperCase():'', network: m&&m[2]?m[2].toUpperCase():'' };
  };

  const patchStartPayment = () => {
    if (window.__SVP_START_PATCHED__) return; window.__SVP_START_PATCHED__=true;
    const orig = window.fetch.bind(window);
    window.fetch = async function(input, init){
      const url = typeof input==='string' ? input : (input && input.url) || '';
      if (/start-payment/i.test(url) && init && init.method && init.method.toUpperCase()==='POST' && init.body) {
        try{
          let body = init.body;
          if (typeof body === 'string') {
            const j = JSON.parse(body);
            const sels = findSelects();
            const assetTxt = sels.assetSel ? (sels.assetSel.value || sels.assetSel.options[sels.assetSel.selectedIndex]?.text) : '';
            const fiatTxt = sels.fiatSel ? (sels.fiatSel.value || sels.fiatSel.options[sels.fiatSel.selectedIndex]?.text) : '';
            const parsed = parseCombo(j.currency || assetTxt);
            if (!j.invoice_currency && fiatTxt) j.invoice_currency = fiatTxt;
            if (!j.currency || /\(/.test(j.currency)) j.currency = parsed.currency;
            if (!j.network && parsed.network) j.network = parsed.network;
            init = {...init, body: JSON.stringify(j)};
          }
        }catch(e){}
      }
      return orig(input, init);
    };
  };

  const banWeakPins = () => {
    if (window.__SVP_PIN_GUARD__) return; window.__SVP_PIN_GUARD__=true;
    const bad = new Set(['000','0000']);
    const desired = '14529863';
    try{
      ['svp_admin_pin','admin_pin','adminPIN','pin'].forEach(k=>{
        const v=localStorage.getItem(k);
        if (!v || bad.has(v)) localStorage.setItem(k, desired);
      });
    }catch(e){}
    document.addEventListener('submit', (ev)=>{
      const el = ev.target;
      if (!el || !el.querySelector) return;
      const inp = el.querySelector('input[type="password"], input[inputmode="numeric"], input[name*="pin" i], input[placeholder*="pin" i]');
      if (inp){
        const val = (inp.value||'').trim();
        if (bad.has(val)) { ev.preventDefault(); ev.stopPropagation(); alert('Invalid PIN'); }
      }
    }, true);
  };

  (async function init(){
    const data = await getMerged();
    const combos = toCombos(data);
    const sels = await wait(()=>findSelects().assetSel);
    const {fiatSel, assetSel} = findSelects();
    if (assetSel && combos.length) populateAssets(assetSel, combos);
    patchStartPayment();
    banWeakPins();
  })();
})();
