import { useEffect, useState } from 'react';
import { episodes } from '../content';
import { useEpisode } from '../engine/game';
import { useLang, useT } from '../i18n';
import { LangSwitch } from './lang';
import { readSave, SLOTS, type Slot } from '../engine/save';
import { unlockAudio } from '../engine/sound';
import { Credits } from './Credits';

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
  const t = useT();
  const lang = useLang((s) => s.lang);
  return (
    <ul className="stack slots">
      {slots.map((slot) => {
        const f = readSave(slot);
        const name = slot === 'auto' ? t('自動存檔') : t('存檔 {n}', { n: slot });
        return (
          <li key={slot}>
            <button
              className="slot"
              disabled={verb === '讀取' && !f}
              onClick={() => onPick(slot)}
              aria-label={lang === 'en' ? `${t(verb)} ${name}` : `${verb}${name}`}
            >
              <strong>{name}</strong>
              <span className="muted">{f ? `${t(f.label)}・${when(f.savedAt)}` : t('空')}</span>
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
  const [picking, setPicking] = useState(false);
  const [credits, setCredits] = useState(false);
  const auto = readSave('auto');
  const t = useT();
  // 瀏覽器要等玩家碰過畫面才肯出聲：標題畫面上的點擊或按鍵都順手解鎖。
  // 各瀏覽器認的手勢不同（iOS 要 touchend／click），所以全部聽，重複呼叫無害。
  useEffect(() => {
    const kinds = ['pointerup', 'click', 'keydown', 'touchend'] as const;
    for (const k of kinds) document.addEventListener(k, unlockAudio, true);
    return () => {
      for (const k of kinds) document.removeEventListener(k, unlockAudio, true);
    };
  }, []);
  return (
    <main className="scene title-screen">
      <span className="title-mark" aria-hidden>
        疑
      </span>
      <div className="title-head">
        <span className="title-rule" aria-hidden />
        {/* 一字一行排成直式；每個字是區塊，所以名字要另外給，不然讀成「合 理 懷 疑」。 */}
        <h1 aria-label={t('合理懷疑')}>
          {[...'合理懷疑'].map((c, i) => (
            <span key={i} aria-hidden>
              {c}
            </span>
          ))}
        </h1>
      </div>
      <div className="title-foot">
        <div className="stack">
          <LangSwitch />
          {auto && (
            <button className="primary" onClick={() => load('auto')}>
              {t('繼續（{label}）', { label: auto.label })}
            </button>
          )}
          <button
            className={auto ? '' : 'primary'}
            onClick={() => setPicking(!picking)}
            aria-expanded={picking}
          >
            {t('新遊戲')}
          </button>
          {picking && (
            <ul className="stack slots">
              {Object.entries(episodes).map(([id, ep]) => (
                <li key={id}>
                  <button className="slot" onClick={() => newGame(id)}>
                    <strong>{t('第 {n} 集', { n: ep.number })}</strong>
                    <span className="muted">{t(ep.title)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setLoading(!loading)} aria-expanded={loading}>
            {t('讀取存檔')}
          </button>
          {loading && <SlotList slots={['auto', ...SLOTS]} verb="讀取" onPick={load} />}
          <button onClick={() => setCredits(!credits)} aria-expanded={credits}>
            {t('製作群')}
          </button>
          {credits && <Credits />}
          <button className="link" onClick={openProto}>
            {t('系統原型（證據板、彈劾、陪審團）')}
          </button>
        </div>
        <p className="title-build">
          {t('垂直切片')}
          <span className="build-id">
            {__BUILD__.sha}・{__BUILD__.at}
          </span>
        </p>
      </div>
    </main>
  );
}
