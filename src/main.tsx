import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { autosaveOnHide } from './engine/game';
import { restoreLang } from './i18n';
import { App } from './ui/App';
import './ui/styles.css';

restoreLang();
autosaveOnHide();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
