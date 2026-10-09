import { useEffect, useState } from 'react';
import { episodes } from '../content';
import { useEpisode } from '../engine/game';
import { useLang, useT } from '../i18n';
import { LangSwitch } from './lang';
import { readSave, SLOTS, type Slot } from '../engine/save';
import { unlockAudio } from '../engine/sound';
import { Credits } from './Credits';
import { DocketMini, SaveBates } from './Dossier';

const when = (t: number, lang: string) =>
  new Date(t).toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW', {
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
  // 存檔畫面只准一道黃（設計師 P2-6 r1）：選中的那一欄用 JS 記，滑鼠滑過不算；只有它的目前行上螢光，焦點框改用墨色。
  const [sel, setSel] = useState<Slot | null>(null);
  return (
    <ul className="stack slots">
      {slots.map((slot) => {
        const f = readSave(slot);
        const name = slot === 'auto' ? t('自動存檔') : t('存檔 {n}', { n: slot });
        return (
          <li key={slot}>
            <button
              className={sel === slot ? 'slot sel' : 'slot'}
              disabled={verb === '讀取' && !f}
              onFocus={() => setSel(slot)}
              onClick={() => onPick(slot)}
              aria-label={lang === 'en' ? `${t(verb)} ${name}` : `${verb}${name}`}
            >
              <strong>{name}</strong>
              <span className="muted">
                {f ? (
                  <>
                    {t(f.label)}
                    {t('・')}
                    {/* 時間整組不斷開（「10:20 AM」的 AM 不單獨一行）。 */}
                    <span className="when">{when(f.savedAt, lang)}</span>
                  </>
                ) : (
                  t('空')
                )}
              </span>
              {/* Bates 區間在章節那一行下面，再下面是縮小的案卷登錄表（設計師 P2-6；設定集第 10 章）。 */}
              {f && <SaveBates progress={f.progress} />}
              {f && <DocketMini progress={f.progress} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Title() {
  const { newGame, load: loadSlot, openProto } = useEpisode();
  // 讀檔清單在手機上要往下捲才看得到；讀進來的場景從頂端開始，不沿用標題頁的捲動位置（體驗評測 v90）。
  const load = (slot: Slot) => {
    if (loadSlot(slot)) window.scrollTo({ top: 0 });
  };
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
        {/* 標準字的黃直線只在沒有別的黃的畫面出現；標題畫面的黃留給「新遊戲」（規格 v2.0 §19 裁定）。 */}
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
          {/* 讀檔清單打開時，黃留給選中的存檔欄那一道（存檔畫面只准一道黃；設計師 P2-6 r1）。 */}
          {auto && (
            <button className={loading ? '' : 'primary'} onClick={() => load('auto')}>
              {t('繼續（{label}）', { label: t(auto.label) })}
            </button>
          )}
          <button
            className={auto || loading ? '' : 'primary'}
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
