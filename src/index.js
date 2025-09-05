import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LoginGate from './components/LoginGate';
import './styles/theme.css';
import './setupApiBridge';
import './setupPinGuard';
import './setupUiPatches';
if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><LoginGate><App/></LoginGate></React.StrictMode>);
