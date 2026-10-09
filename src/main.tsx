import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { restoreLang } from './i18n';
import { App } from './ui/App';
import { restorePhotosafe } from './ui/photosafe';
import './ui/styles.css';
import './ui/court.css';

restoreLang();
restorePhotosafe();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
