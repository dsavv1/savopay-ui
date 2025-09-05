export const API_BASE = (window._SVP_API_BASE || (typeof process!=='undefined'&&process.env&&process.env.REACT_APP_API_BASE) || 'https://api.savopay.co').replace(/\/$/,'');
export const BUILD_TAG = `UI build: ${ (typeof process!=='undefined'&&process.env&&process.env.REACT_APP_UI_BUILD) || 'dev' }`;
