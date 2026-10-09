import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { restoreLang } from './i18n';
import { App } from './ui/App';
import { restoreA11y } from './ui/a11y';
import './ui/styles.css';
import './ui/court.css';

restoreLang();
restoreA11y();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
