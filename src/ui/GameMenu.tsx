import { useEffect, useRef, useState } from 'react';
import { useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { SLOTS, type Slot } from '../engine/save';
import { SettingsPanel } from './Settings';
import { SlotList } from './Title';

/** 遊戲中隨時可開的選單：手動存檔 3 格、讀檔、回標題（企劃書 6.14「隨時存檔」）。 */
export function GameMenu() {
  const { save, load, toTitle } = useEpisode();
  const [open, setOpen] = useState<null | 'save' | 'load' | 'options'>(null);
  const [note, setNote] = useState('');
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  // 點選單外面或按 Esc 就收起來，不必再按一次「選單」（試玩回報：開著會擋住畫面）。
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const onSave = (slot: Slot) => setNote(save(slot) ? t('已存檔。') : t('這個瀏覽器不允許存檔。'));
  const onLoad = (slot: Slot) => {
    if (load(slot)) setOpen(null);
  };
  return (
    <div className="game-menu" ref={box}>
      <button
        className="menu-toggle"
        aria-expanded={open !== null}
        onClick={() => {
          setNote('');
          setOpen(open ? null : 'save');
        }}
      >
        {t('選單')}
      </button>
      {open && (
        <div className="menu-panel panel" role="dialog" aria-label={t('選單')}>
          <div className="row" role="tablist">
            <button role="tab" aria-selected={open === 'save'} onClick={() => setOpen('save')}>
              {t('存檔')}
            </button>
            <button role="tab" aria-selected={open === 'load'} onClick={() => setOpen('load')}>
              {t('讀檔')}
            </button>
            <button
              role="tab"
              aria-selected={open === 'options'}
              onClick={() => setOpen('options')}
            >
              {t('選項')}
            </button>
            <button onClick={toTitle}>{t('回標題')}</button>
          </div>
          {open === 'save' && <SlotList slots={SLOTS} verb="存到" onPick={onSave} />}
          {open === 'load' && <SlotList slots={['auto', ...SLOTS]} verb="讀取" onPick={onLoad} />}
          {open === 'options' && <SettingsPanel />}
          {note && <p role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}
