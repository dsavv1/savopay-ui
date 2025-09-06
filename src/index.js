import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.v2.css';
import App from './App';

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
