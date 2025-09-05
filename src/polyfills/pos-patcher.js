(function(){
  const pe=(typeof process!=='undefined'&&process.env)?process.env:{};
  const API=(window._SVP_API_BASE||pe.REACT_APP_API_BASE||'https://api.savopay.co').replace(/\/$/,'');
  const abs=(u)=>/^https?:\/\//i.test(u)?u:API+(u.startsWith('/')?u:'/'+u);
  const wait=(sel,t=100,n=100)=>new Promise(r=>{const i=setInterval(()=>{const el=typeof sel==='function'?sel():document.querySelector(sel);if(el){clearInterval(i);r(el)};if(--n<=0){clearInterval(i);r(null)}},t)});

  if(window.fetch&&!window.__SVP_FETCH_BASE_BRIDGED__){
    const orig=window.fetch.bind(window); window.__SVP_FETCH_BASE_BRIDGED__=true;
    window.fetch=function(input,init){let url=typeof input==='string'?input:(input&&input.url)||'';if(/^\/(payments|meta|supported|start-payment|refund|status|invoices|auth)\b/i.test(url)||(!/^https?:/i.test(url)&&!url.startsWith('data:'))){const a=abs(url);input=(typeof input==='string')?a:new Request(a,input);}return orig(input,init);};
  }

  if(window.XMLHttpRequest&&!window.XMLHttpRequest.__SVP_XHR_BRIDGED__){
    const XHR=window.XMLHttpRequest;const open=XHR.prototype.open;
    XHR.prototype.open=function(m,u,a,user,pw){let f=u;if(/^\/(payments|meta|supported|start-payment|refund|status|invoices|auth)\b/i.test(u)||!/^https?:/i.test(u)){f=abs(u);}return open.call(this,m,f,a,user,pw)};
    window.XMLHttpRequest.__SVP_XHR_BRIDGED__=true;
  }

  (function pin(){
    if(window.__SVP_PIN_GUARD__)return;window.__SVP_PIN_GUARD__=true;
    const bad=new Set(['000','0000']);const desired='14529863';
    try{['svp_admin_pin','admin_pin','adminPIN','pin'].forEach(k=>{const v=localStorage.getItem(k);if(!v||bad.has(v))localStorage.setItem(k,desired);});}catch(_){}
    document.addEventListener('submit',ev=>{const el=ev.target;if(!el||!el.querySelector)return;const inp=el.querySelector('input[type="password"],input[inputmode="numeric"],input[name*="pin" i],input[placeholder*="pin" i]');if(inp){const v=(inp.value||'').trim();if(bad.has(v)){ev.preventDefault();ev.stopPropagation();alert('Invalid PIN');}}},true);
  })();

  (function style(){
    if(document.querySelector('style[data-id="SVP_STYLE_INJECT_V1"]'))return;
    const css=`/* SVP_STYLE_INJECT_V1 */:root{--bg:#f6f8fc;--card:#fff;--border:#e6e9ef;--text:#0b1f44;--muted:#6b7a90;--error:#b42318;--brand:#1652F0;--brand-dark:#0b3bcf}
      body{background:var(--bg)!important;color:var(--text)!important}
      .app-header h1{color:var(--brand-dark)!important}
      button,select,input{font-size:13px!important;padding:6px 10px!important;border-radius:10px!important;border:1px solid var(--border)!important;background:#fff!important;line-height:1.2!important}
      button.primary{background:var(--brand)!important;border-color:var(--brand)!important;color:#fff!important}`;
    const e=document.createElement('style');e.setAttribute('data-id','SVP_STYLE_INJECT_V1');e.appendChild(document.createTextNode(css));document.head.appendChild(e);
  })();

  (async function assets(){
    const get=async()=>{try{const r=await fetch(API+'/meta/supported');const j=await r.json();if(j&&j.crypto&&j.fiat)return j;}catch(e){}return{fiat:['USD','NGN','GBP','EUR'],crypto:[{symbol:'USDT',networks:['TRON','ERC20','BEP20']},{symbol:'USDC',networks:['ERC20','TRON']},{symbol:'BTC',networks:['BTC']},{symbol:'ETH',networks:['ERC20']},{symbol:'BUSD',networks:['BEP20']}]};};
    const combos=(d=>{const a=[];(d.crypto||[]).forEach(x=>(x.networks||['']).forEach(n=>a.push(`${x.symbol}${n?` (${n})`:''}`)));return a;})(await get());
    const find=()=>{const s=[...document.querySelectorAll('select')];return s.find(el=>[...el.options].some(o=>/\b(USDT|USDC|BTC|ETH|BUSD)\b/i.test(o.text)||/\([^)]+\)$/.test(o.text)));};
    await wait(find); const sel=find(); if(!sel||!combos.length)return;
    const cur=sel.value||sel.options[sel.selectedIndex]?.text||''; sel.innerHTML=combos.map(c=>`<option>${c}</option>`).join(''); sel.value=combos.includes(cur)?cur:combos[0];
  })();
})();
