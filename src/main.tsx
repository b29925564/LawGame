import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { restoreLang } from './i18n';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/court.css';

restoreLang();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
