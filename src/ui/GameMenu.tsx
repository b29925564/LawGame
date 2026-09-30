import { useState } from 'react';
import { useEpisode } from '../engine/game';
import { SLOTS, type Slot } from '../engine/save';
import { SlotList } from './Title';

/** 遊戲中隨時可開的選單：手動存檔 3 格、讀檔、回標題（企劃書 6.14「隨時存檔」）。 */
export function GameMenu() {
  const { save, load, toTitle } = useEpisode();
  const [open, setOpen] = useState<null | 'save' | 'load'>(null);
  const [note, setNote] = useState('');
  const onSave = (slot: Slot) => setNote(save(slot) ? '已存檔。' : '這個瀏覽器不允許存檔。');
  const onLoad = (slot: Slot) => {
    if (load(slot)) setOpen(null);
  };
  return (
    <div className="game-menu">
      <button
        className="menu-toggle"
        aria-expanded={open !== null}
        onClick={() => {
          setNote('');
          setOpen(open ? null : 'save');
        }}
      >
        選單
      </button>
      {open && (
        <div className="menu-panel panel" role="dialog" aria-label="選單">
          <div className="row" role="tablist">
            <button role="tab" aria-selected={open === 'save'} onClick={() => setOpen('save')}>
              存檔
            </button>
            <button role="tab" aria-selected={open === 'load'} onClick={() => setOpen('load')}>
              讀檔
            </button>
            <button onClick={toTitle}>回標題</button>
          </div>
          {open === 'save' ? (
            <SlotList slots={SLOTS} verb="存到" onPick={onSave} />
          ) : (
            <SlotList slots={['auto', ...SLOTS]} verb="讀取" onPick={onLoad} />
          )}
          {note && <p role="status">{note}</p>}
        </div>
      )}
    </div>
  );
}
