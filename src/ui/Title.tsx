import { useEffect, useState } from 'react';
import { episodeLoaded, episodeMeta, loadEpisode, onEpisodeLoaded, isEpisodeId } from '../content';
import { newGameEpisodes, useEpisode } from '../engine/game';
import { useSettings } from '../engine/settings';
import { useLang, useT } from '../i18n';
import { LangSwitch } from './lang';
import { readSave, SLOTS, unreadable, type Slot } from '../engine/save';
import { unlockAudio } from '../engine/sound';
import { Credits } from './Credits';
import { fitLine } from './prose';
import { useFault } from './ErrorBoundary';
import { DocketMini, SaveBates } from './Dossier';
import { useShallow } from 'zustand/react/shallow';
import { warmMainFonts } from './fonts/warm';

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
  // 存檔欄的案卷登錄表要看劇本：用到的集數先載入，載好再畫一次（#388）。
  const [, redraw] = useState(0);
  useEffect(() => onEpisodeLoaded(() => redraw((n) => n + 1)), []);
  const files = slots.map((slot) => readSave(slot));
  const need = [...new Set(files.map((f) => f?.progress.episode))].filter(isEpisodeId).join(',');
  useEffect(() => {
    for (const id of need.split(',').filter(isEpisodeId)) loadEpisode(id).catch(() => undefined);
  }, [need]);
  return (
    <ul className="stack slots">
      {slots.map((slot, i) => {
        const f = files[i];
        const name = slot === 'auto' ? t('自動存檔') : t('存檔 {n}', { n: slot });
        return (
          <li key={slot}>
            <button
              className={sel === slot ? 'slot sel' : 'slot'}
              disabled={verb === '讀取' && !f}
              onFocus={(e) => {
                setSel(slot);
                // 鍵盤移到這一欄：整張卡連同墨色焦點框捲進看得見的範圍（scroll-margin 留給焦點框；設計師 P2-6 r3 第 4 條）。
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
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
                ) : unreadable(slot) ? (
                  // 有資料但讀不出來（壞掉、或是比這一版新的存檔）：不說「空」，免得玩家以為進度不見了（Issue #364）。
                  t('讀不出來')
                ) : (
                  t('空')
                )}
              </span>
              {/* Bates 區間在章節那一行下面，再下面是縮小的案卷登錄表（設計師 P2-6；設定集第 10 章）。 */}
              {f && episodeLoaded(f.progress.episode) && <SaveBates progress={f.progress} />}
              {f && episodeLoaded(f.progress.episode) && <DocketMini progress={f.progress} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Title() {
  const {
    newGame,
    load: loadSlot,
    openProto,
  } = useEpisode(useShallow((s) => ({ newGame: s.newGame, load: s.load, openProto: s.openProto })));
  // 讀檔清單在手機上要往下捲才看得到；讀進來的場景從頂端開始，不沿用標題頁的捲動位置（體驗評測 v90）。
  const load = (slot: Slot) => {
    void Promise.resolve(loadSlot(slot)).then((ok) => ok && window.scrollTo({ top: 0 }));
  };
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [credits, setCredits] = useState(false);
  // 標題畫面每次進來才讀一次：讀檔要解析整份 JSON，不必每次 render 都做（Issue #388 P5）。
  const [auto] = useState(() => readSave('auto'));
  // 新遊戲只列第 1 集和前一集打完的集（#442：教學全在第 1 集）；已經有存檔的集照樣列。
  const [savedEps] = useState(() =>
    (['auto', ...SLOTS] as const).map((slot) => readSave(slot)?.progress.episode),
  );
  const cleared = useSettings((s) => s.cleared);
  const playable = newGameEpisodes(cleared, savedEps);
  // 自動存檔有資料卻讀不出來：沒有「繼續」，要說一聲（Issue #364）。
  const [broken] = useState(() => !auto && unreadable('auto'));
  // 被畫面錯誤送回來的那一次才說明；讀過就清掉，下次回標題不再出現。
  const [fault] = useState(() => useFault.getState().fault);
  useEffect(() => {
    useFault.setState({ fault: null });
  }, []);
  // 標題畫完、閒下來再預載對白要用的中文主檔（設計師 #462 複審；fonts/warm.ts）。
  useEffect(warmMainFonts, []);
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
        {broken && (
          <div className="title-note">
            <p role="status">{fitLine(t('自動存檔讀不出來，沒辦法從上次的地方繼續。'))}</p>
          </div>
        )}
        {fault && (
          <div className="title-note">
            <p role="status">
              {/* 排字照短標籤規則（fitLine）：中文在詞界換行，不切在「重新載｜入」中間（設計師 #407）。 */}
              {fitLine(
                fault === 'load'
                  ? t(
                      '畫面沒能載入，已回到標題。請確認網路連線後重新載入，進度停在上一次自動存檔。',
                    )
                  : t('剛才的畫面出了錯，已回到標題。進度停在上一次自動存檔。'),
              )}
            </p>
            {/* 瀏覽器會記住下載失敗的模組，不重新載入頁面就一直失敗（Chromium 實測），所以給一顆重新載入。 */}
            {fault === 'load' && (
              <button className="link" onClick={() => location.reload()}>
                {t('重新載入')}
              </button>
            )}
          </div>
        )}
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
            // 只有一集能選（第一次玩）就直接開始，不出現只有一列的清單（設計師 #452）。
            onClick={() => (playable.length === 1 ? newGame(playable[0]) : setPicking(!picking))}
            aria-expanded={playable.length === 1 ? undefined : picking}
          >
            {t('新遊戲')}
          </button>
          {picking && (
            <ul className="stack slots">
              {Object.entries(episodeMeta)
                .filter(([id]) => playable.includes(id))
                .map(([id, ep]) => (
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
