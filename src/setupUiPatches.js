import { API_BASE } from './config';
(function(){
  async function getSupported(){
    try{ const r=await fetch(API_BASE+'/meta/supported'); const j=await r.json(); if(j&&j.crypto&&j.fiat) return j; }catch(_){}
    return {fiat:['USD','NGN','GBP','EUR'],crypto:[
      {symbol:'USDT',networks:['TRON','ERC20','BEP20']},
      {symbol:'USDC',networks:['ERC20','TRON']},
      {symbol:'BTC',networks:['BTC']},
      {symbol:'ETH',networks:['ERC20']},
      {symbol:'BUSD',networks:['BEP20']},
    ]};
  }
  const combos = d => { const out=[]; (d.crypto||[]).forEach(a=>(a.networks||['']).forEach(n=>out.push(`${a.symbol}${n?` (${n})`:''}`))); return out; };
  const wait = (fn,tries=120,ms=250)=>new Promise(res=>{const id=setInterval(()=>{const x=fn();if(x){clearInterval(id);res(x);} if(--tries<=0){clearInterval(id);res(null)}},ms)});
  const findAsset = ()=>{const s=[...document.querySelectorAll('select')];return s.find(el=>{const v=[...el.options].map(o=>o.text);return v.some(x=>/\b(USDT|USDC|BTC|ETH|BUSD)\b/i.test(x))||v.some(x=>/\([^)]+\)$/.test(x));});};
  if(!document.querySelector('style[data-id="SVP_THEME_VARS"]')){
    const css=`:root{--bg:#f6f8fc;--card:#fff;--border:#e6e9ef;--text:#0b1f44;--muted:#6b7a90;--error:#b42318;--brand:#1652F0;--brand-dark:#0b3bcf}
body{background:var(--bg)!important;color:var(--text)!important}
.app-header h1{color:var(--brand-dark)!important}
button,select,input{font-size:13px!important;padding:6px 10px!important;border-radius:10px!important;border:1px solid var(--border)!important;background:#fff!important;line-height:1.2!important}
button.primary{background:var(--brand)!important;border-color:var(--brand)!important;color:#fff!important}`;
    const e=document.createElement('style'); e.setAttribute('data-id','SVP_THEME_VARS'); e.appendChild(document.createTextNode(css)); document.head.appendChild(e);
  }
  (async()=>{
    const list=combos(await getSupported());
    const sel=await wait(findAsset); if(!sel||!list.length) return;
    const cur=sel.value||sel.options[sel.selectedIndex]?.text||''; sel.innerHTML=list.map(c=>`<option>${c}</option>`).join(''); sel.value=list.includes(cur)?cur:list[0];
  })();
})();
