import { useState } from 'react';
import { useEpisode } from '../engine/game';
import { readSave, SLOTS, type Slot } from '../engine/save';

const when = (t: number) =>
  new Date(t).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 存檔格清單；讀檔與存檔共用。 */
export function SlotList({
  slots,
  verb,
  onPick,
}: {
  slots: readonly Slot[];
  verb: string;
  onPick: (slot: Slot) => void;
}) {
  return (
    <ul className="stack slots">
      {slots.map((slot) => {
        const f = readSave(slot);
        const name = slot === 'auto' ? '自動存檔' : `存檔 ${slot}`;
        return (
          <li key={slot}>
            <button
              className="slot"
              disabled={verb === '讀取' && !f}
              onClick={() => onPick(slot)}
              aria-label={`${verb}${name}`}
            >
              <strong>{name}</strong>
              <span className="muted">{f ? `${f.label}・${when(f.savedAt)}` : '空'}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Title() {
  const { newGame, load, openProto } = useEpisode();
  const [loading, setLoading] = useState(false);
  const auto = readSave('auto');
  return (
    <main className="scene title-screen">
      <span className="title-mark" aria-hidden>
        疑
      </span>
      <div className="title-head">
        <span className="title-rule" aria-hidden />
        <h1>
          {[...'合理懷疑'].map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </h1>
      </div>
      <div className="title-foot">
        <p className="title-episode">
          <span>第一集</span>
          <strong>已收回的訊息</strong>
        </p>
        <div className="stack">
          {auto && (
            <button className="primary" onClick={() => load('auto')}>
              繼續（{auto.label}）
            </button>
          )}
          <button className={auto ? '' : 'primary'} onClick={newGame}>
            新遊戲
          </button>
          <button onClick={() => setLoading(!loading)} aria-expanded={loading}>
            讀取存檔
          </button>
          {loading && <SlotList slots={['auto', ...SLOTS]} verb="讀取" onPick={load} />}
          <button className="link" onClick={openProto}>
            系統原型（證據板、彈劾、陪審團）
          </button>
        </div>
        <p className="title-build">垂直切片</p>
      </div>
    </main>
  );
}
