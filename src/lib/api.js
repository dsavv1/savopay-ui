const API_BASE = (process.env.REACT_APP_API_BASE || window.__SVP_API_BASE || 'https://api.savopay.co').replace(/\/+$/,'');
export const apiUrl = (path) => {
  const p = String(path || '').replace(/^\/+/, '');
  return new URL(p, API_BASE + '/').toString();
};
export const API_BASE_URL = API_BASE;
