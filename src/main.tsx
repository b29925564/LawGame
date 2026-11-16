import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isEpisodeId, loadEpisode } from './content';
import { autosaveOnHide } from './engine/game';
import { readSave, SLOTS } from './engine/save';
import { restoreLang } from './i18n';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { restoreA11y } from './ui/a11y';
import './ui/styles.css';
import './ui/court.css';
import './ui/dossier.css';

restoreLang();
restoreA11y();
autosaveOnHide();

// 劇本依集數動態載入（#388）：存檔用到的集數先載好再畫，讀檔和存檔欄的案卷登錄表都同步讀劇本。
// 沒有存檔的新玩家什麼都不先載，開新局時才載那一集。載入失敗（離線）照常畫，讀檔時再試。
const saved = new Set((['auto', ...SLOTS] as const).map((s) => readSave(s)?.progress.episode));
void Promise.all(
  [...saved].filter(isEpisodeId).map((id) => loadEpisode(id).catch(() => undefined)),
).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  ),
);
