import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { excerpt, type Excerpt } from '../engine/episode/defense';
import type { DefenseScene, Episode } from '../engine/episode/schema';
import { preload, tIn, useCatalog, useLang, useT, type Lang } from '../i18n';
import { straight } from '../i18n/curly';
import { reducedMotion } from './a11y';
import { IdPhoto } from './IdPhoto';
import { useScope } from './lang';
import { layout, measureFor, type RecordEntry } from './record';
import { punct } from './Record';
import './prep.css';

type Option = DefenseScene['prep']['options'][number];

/** 迴紋針：兩圈套在一起的 U 形，一腳在卡面上、一腳藏在卡後（設計師 P2-9 審查）。 */
function Clip() {
  return (
    <svg className="pclip" viewBox="0 0 14 38" aria-hidden focusable="false">
      <path
        d="M3 36 V8 a4 4 0 0 1 8 0 V29 a2.5 2.5 0 0 1 -5 0 V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 從筆錄頁剪下的一條：排版直接用法庭筆錄的 layout()（中文一行 24 字、英文 44 字元，每個排出來的行都有行號）。
 * 答的第一行落在劇本的 cite；問排在它前面，下一題的問接在答後面。兩種語言共用頁行（twin），
 * 所以中文模式與英文模式裡答案都從同一行開始。
 */
function useStrip(ex: Excerpt | null) {
  const scope = useScope();
  const lang = useLang((s) => s.lang);
  const catalog = useCatalog((s) => s.n);
  useEffect(preload, []);
  return useMemo(() => {
    if (!ex) return null;
    const zh = lang === 'zh';
    const other: Lang = zh ? 'en' : 'zh';
    const say = (who: 'q' | 'a', text: string, in_: Lang) => ({
      tag: tIn(in_, who === 'q' ? '問' : '答', 'record'),
      // 筆錄元件是 Courier Prime 的打字稿：引號維持直的。
      text: straight(tIn(in_, text, scope)),
    });
    const entries: RecordEntry[] = ex.segs.map((g) => ({
      kind: g.who,
      ...say(g.who, g.text, lang),
      twin: say(g.who, g.text, other),
    }));
    const rows = layout(entries, measureFor(zh), zh, () => 0, {
      measure: measureFor(!zh),
      zh: !zh,
      stamp: () => 0,
    });
    // 答的第一行就是 cite 的那一行；其他行照排版往前、往後數。
    const a0 = rows.findIndex((r) => r.entry === 1);
    const shift = ex.line - (a0 + 1);
    // 答占的行數取兩種語言較多的那一版（twin），出處的行號兩種語言一樣。
    const aRows = rows.filter((r) => r.entry === 1);
    const first = ex.line;
    const last = ex.line + aRows.length - 1;
    return { entries, rows, shift, first, last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex, lang, scope, catalog]);
}

/**
 * 夾在卡後的筆錄影本（P2-9 §3）：從第 N 頁剪下的一條，沒有頁首、沒有說明字，只有他要背的那句話
 * 和他宣誓過的上下文。頁碼由盧卡斯用鉛筆寫在卡上（Cite）。
 */
function CopyStrip({
  strip,
  page,
}: {
  strip: NonNullable<ReturnType<typeof useStrip>>;
  page: number;
}) {
  const t = useT();
  const zh = useLang((s) => s.lang) === 'zh';
  return (
    <figure className="prep-copy" aria-label={t('取證筆錄影本')} data-page={page}>
      <div className="record prep-strip">
        <div className="rec-paper">
          {strip.entries.map((e, i) => (
            <p key={i} className={`rec-entry ${e.kind}`}>
              {strip.rows
                .filter((r) => r.entry === i)
                .map((r) => (
                  <span key={r.index} className="rec-line">
                    <span
                      className="rec-row"
                      data-no={r.index + 1 + strip.shift}
                      style={{ '--indent': `${r.indent}em` } as CSSProperties}
                    >
                      {r.first && e.tag && <b className="rec-tag">{e.tag} </b>}
                      <span className="rec-tx">{zh ? punct(r.text) : r.text}</span>
                      {r.space && ' '}
                    </span>
                  </span>
                ))}
            </p>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** 盧卡斯的鉛筆出處：律師引筆錄的寫法，數字由排版算出來。 */
function Cite({
  strip,
  page,
  witness,
}: {
  strip: NonNullable<ReturnType<typeof useStrip>>;
  page: number;
  witness: string;
}) {
  const t = useT();
  const scope = useScope();
  const surname =
    t(witness, scope)
      .split(/[・·\s]+/)
      .filter(Boolean)
      .pop() ?? witness;
  const lines = strip.last > strip.first ? `${strip.first}–${strip.last}` : `${strip.first}`;
  return (
    <span className="cite">
      {t('{who}錄取筆錄 {cite}', { who: surname, cite: `${page}:${lines}` })}
    </span>
  );
}

function Option({
  ep,
  o,
  picked,
  out,
  tab,
  setRef,
  onPick,
  onKey,
}: {
  ep: Episode;
  o: Option;
  picked: boolean;
  out: boolean;
  tab: number;
  setRef: (el: HTMLDivElement | null) => void;
  onPick: () => void;
  onKey: (e: KeyboardEvent) => void;
}) {
  const t = useT();
  const scope = useScope();
  const ex = o.transcript ? excerpt(ep, o.transcript) : null;
  const strip = useStrip(ex);
  return (
    <div
      ref={setRef}
      role="radio"
      aria-checked={picked}
      tabIndex={tab}
      className={`prep-card ink-select${picked ? ' picked' : ''}${out ? ' out' : ''}${strip ? ' clipped' : ''}`}
      onClick={onPick}
      onKeyDown={onKey}
    >
      <div className="paper-wrap">
        <div className="card-paper">
          <b className="label">{t(o.label, scope)}</b>
          <span className="detail">{t(o.detail, scope)}</span>
          {ex && strip && <Cite strip={strip} page={ex.page} witness={ex.witness} />}
        </div>
        {ex && strip && <Clip />}
      </div>
      {ex && strip && <CopyStrip strip={strip} page={ex.page} />}
    </div>
  );
}

/**
 * 證人準備（P2-9）：事務所裡的卷宗桌面。左邊是證人，右邊每個選項是一張盧卡斯用鉛筆寫的索引卡。
 * 點卡或方向鍵選取（一次一張，外面一圈 2px 墨框淡入）；確認鈕是整個畫面唯一的黃。
 * 確認後不蓋章：沒選的淡出，選中的停一拍，然後進入直接詰問。
 */
export function WitnessPrep({
  scene,
  ep,
  onPrepare,
}: {
  scene: DefenseScene;
  ep: Episode;
  onPrepare: (id: string) => void;
}) {
  const t = useT();
  const scope = useScope();
  const opts = scene.prep.options;
  const [pick, setPick] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hours = scene.prep.hours;
  const confirm = () => {
    if (!pick || going) return;
    if (reducedMotion()) return onPrepare(pick);
    setGoing(true);
    // 沒選的淡出（--dur-ui），選中的再停一個 --dur-ui。
    timer.current = window.setTimeout(() => onPrepare(pick), 360);
  };
  const move = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = opts[(i + step + opts.length) % opts.length];
    setPick(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <main className="scene prep">
      <p className="eyebrow">
        {t(scene.act, scope)}
        {scene.day ? `・${t(scene.day, scope)}` : ''}
      </p>
      <div className="prep-desk">
        <section className="prep-who">
          <span className="prep-photo">
            <span className="mobile-only">
              <IdPhoto who={scene.witness.name} size={72} />
            </span>
            <span className="wide-only">
              <IdPhoto who={scene.witness.name} size={96} />
            </span>
          </span>
          <div className="prep-id">
            <h2 className="prep-name">{t(scene.witness.name, scope)}</h2>
            <p className="prep-role">{t(scene.witness.role, scope)}</p>
            <p className="prep-hours">{t('準備時間 {n} 工時', { n: hours })}</p>
          </div>
        </section>
        <div className="prep-main">
          <div className="prep-cards" role="radiogroup" aria-label={t('準備方式')}>
            {opts.map((o, i) => (
              <Option
                key={o.id}
                ep={ep}
                o={o}
                picked={pick === o.id}
                out={going && pick !== o.id}
                tab={pick === o.id || (!pick && i === 0) ? 0 : -1}
                setRef={(el) => {
                  refs.current[o.id] = el;
                }}
                onPick={() => !going && setPick(o.id)}
                onKey={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    if (!going) setPick(o.id);
                  } else move(e, i);
                }}
              />
            ))}
          </div>
          <div className="prep-bar">
            <button className="primary" disabled={!pick || going} onClick={confirm}>
              {hours > 0 ? t('就這樣準備（−{n} 工時）', { n: hours }) : t('就這樣準備')}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
