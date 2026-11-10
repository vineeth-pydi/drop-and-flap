import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import App from './App';
import { registerAppWorker } from './lib/appUpdate';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
if('serviceWorker' in navigator && import.meta.env.PROD){
  window.addEventListener('load',()=>{void registerAppWorker();});
}
