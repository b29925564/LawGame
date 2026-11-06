import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useEpisode } from '../engine/game';
import { useT } from '../i18n';
import { SLOTS, type Slot } from '../engine/save';
import { SettingsPanel } from './Settings';
import { SlotList } from './Title';

type Tab = null | 'save' | 'load' | 'options';
/** 選單開著沒有、開在哪一頁。片頭（TitleIntro）讀它來暫停，按 Esc 也從這裡打開。 */
export const useMenu = create<{ open: Tab; setOpen: (open: Tab) => void }>((set) => ({
  open: null,
  setOpen: (open) => set({ open }),
}));

/** 遊戲中隨時可開的選單：手動存檔 3 格、讀檔、回標題（企劃書 6.14「隨時存檔」）。 */
export function GameMenu() {
  const { save, load, toTitle } = useEpisode();
  const open = useMenu((s) => s.open);
  const setOpen = useMenu((s) => s.setOpen);
  // 選單跟著遊戲畫面掛載：離開（回標題）就收起來，下次進來不是開著的。
  useEffect(() => () => useMenu.getState().setOpen(null), []);
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
  }, [open, setOpen]);
  const onSave = (slot: Slot) => setNote(save(slot) ? t('已存檔。') : t('這個瀏覽器不允許存檔。'));
  const onLoad = (slot: Slot) => {
    if (!load(slot)) return;
    setOpen(null);
    // 手機整頁捲動：讀進來的場景從頂端開始，不沿用讀檔前的捲動位置（體驗評測 v90）。
    window.scrollTo({ top: 0 });
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
