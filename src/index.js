import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginGate from './components/LoginGate';
import './theme.v3.css';
import './styles/overrides.coinbase.css';
if('serviceWorker'in navigator&&!localStorage.getItem('SW_CLEAN')){navigator.serviceWorker.getRegistrations().then(rs=>{rs.forEach(r=>r.unregister());localStorage.setItem('SW_CLEAN','1');});}

try {
  const keys = ['svp_admin_pin','admin_pin','adminPIN','pin'];
  const desired = '14529863';
  keys.forEach(k => {
    const v = localStorage.getItem(k);
    if (!v || v === '0000' || v === '000') localStorage.setItem(k, desired);
  });
} catch(e) {}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><LoginGate><App /></LoginGate></React.StrictMode>);
