import { API_BASE } from './config';
(function(){
  if (window.__SVP_API_BRIDGE__) return; window.__SVP_API_BRIDGE__=true;
  const abs = u => /^https?:\/\//i.test(u) ? u : API_BASE + (u.startsWith('/') ? u : '/' + u);
  const needs = u => /^\/(payments|meta|supported|start-payment|refund|status|invoices|auth)\b/i.test(u) || (!/^https?:/i.test(u) && !String(u).startsWith('data:'));
  if (window.fetch){
    const orig = window.fetch.bind(window);
    window.fetch = (input, init) => {
      let url = typeof input==='string' ? input : (input&&input.url)||'';
      if (needs(url)) input = (typeof input==='string') ? abs(url) : new Request(abs(url), input);
      return orig(input, init);
    };
  }
  if (window.XMLHttpRequest && !window.XMLHttpRequest.__SVP_XBRIDGED__){
    const XHR = window.XMLHttpRequest; const open = XHR.prototype.open;
    XHR.prototype.open = function(m,u,a,user,pw){ const f = needs(u)?abs(u):u; return open.call(this,m,f,a,user,pw); };
    window.XMLHttpRequest.__SVP_XBRIDGED__ = true;
  }
})();
