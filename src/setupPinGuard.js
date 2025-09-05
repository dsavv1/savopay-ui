(function(){
  if (window.__SVP_PIN_GUARD__) return; window.__SVP_PIN_GUARD__=true;
  const BAD = new Set(['000','0000']); const DESIRED = '14529863';
  try{ ['svp_admin_pin','admin_pin','adminPIN','pin'].forEach(k=>{const v=localStorage.getItem(k);if(!v||BAD.has(v))localStorage.setItem(k,DESIRED);}); }catch(_){}
  document.addEventListener('submit',ev=>{
    const el=ev.target; if(!el||!el.querySelector) return;
    const inp=el.querySelector('input[type="password"],input[inputmode="numeric"],input[name*="pin" i],input[placeholder*="pin" i]');
    if(!inp) return; const val=(inp.value||'').trim();
    if(BAD.has(val)){ev.preventDefault();ev.stopPropagation();alert('Invalid PIN');}
  },true);
})();
