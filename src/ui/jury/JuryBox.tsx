import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Jury } from '../../engine/jury';
import { useSettings } from '../../engine/settings';
import { useT } from '../../i18n';
import { useScope } from '../lang';
import looks from './jurors.json';
import { band, poseFor, shadowWidth, svg, tick, type JurorLook, type Pose } from './silhouette';

/** 候選人的剪影參數（視覺設計師 #2 的 jurors.json，id 對劇本第 15 場 candidates）。 */
export function lookOf(episode: string, id: string): JurorLook {
  const list = (looks as unknown as Record<string, JurorLook[]>)[episode] ?? [];
  return list.find((l) => l.id === id) ?? { id, hair: 'buzz' };
}

// 第 8.2 章：單次影響往你這邊 ≥ 10 → J4 低頭寫筆記 2 秒；≥ 5 → 點頭。往檢方的沒有動作。
const NOTES_AT = -10;
const NOD_AT = -5;
const NOTES_MS = 2000;

const POSTURE: Record<Pose, string> = {
  J1: '端坐',
  J2: '前傾',
  J3: '後靠抱胸',
  J4: '低頭寫筆記',
};

/**
 * 一張陪審員卡（設定集第 8.2、8.4 章）：光影藏臉替身，姿勢跨區間 300ms 交叉淡化，
 * 影子從卡面右側吃進來（四階 0／30／60／90%，--dur-shadow 移動）。
 */
export function JurorFace({
  look,
  v,
  seat,
  notes,
  nod,
}: {
  look: JurorLook;
  v: number;
  seat: string;
  /** J4 事件姿勢。 */
  notes?: boolean;
  /** 點頭的次數鍵：一變就點一次頭。 */
  nod?: number;
}) {
  const t = useT();
  const pose: Pose = notes ? 'J4' : poseFor(v);
  const lit = band(v);
  const label = t('待放 AI 立繪　{no}', { no: seat });
  const key = `${pose}-${lit}`;
  const html = useMemo(
    () => svg({ ...look, no: seat }, { v, pose, uid: `${look.id}-${key}` }),
    // v 只透過 band、pose 影響畫面
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [look, seat, key],
  );
  // 換姿勢：舊的那張留 300ms 淡出（交叉淡化），不整張 transform。
  const [layers, setLayers] = useState([{ key, html }]);
  if (layers[layers.length - 1].key !== key) setLayers([...layers.slice(-1), { key, html }]);
  useEffect(() => {
    if (layers.length < 2) return;
    const id = setTimeout(() => setLayers((l) => l.slice(-1)), 320);
    return () => clearTimeout(id);
  }, [layers]);
  return (
    <span className="jf-face" data-pose={pose}>
      <span className="jf-tilt" key={nod ?? 0} data-nod={nod ? '' : undefined}>
        {layers.map((l, i) => (
          <span
            key={l.key}
            className={
              i < layers.length - 1 ? 'jf-svg out' : layers.length > 1 ? 'jf-svg in' : 'jf-svg'
            }
            dangerouslySetInnerHTML={{ __html: l.html }}
          />
        ))}
      </span>
      <span
        className="jf-shadow"
        style={{ '--sh': `${(shadowWidth(look, v) / 4).toFixed(2)}%` } as CSSProperties}
      />
      {/* 「待放 AI 立繪」虛線框永遠看得到（第 7.6 章）：疊在影子上面，不被影子吃掉。 */}
      <svg className="jf-label" viewBox="0 0 400 500" aria-hidden focusable="false">
        <rect x="14" y="14" width="372" height="472" />
        <text x="28" y="470">
          {label}
        </text>
      </svg>
    </span>
  );
}

/** 圖例：半邊影子的臉＋「影子＝懷疑」（第 8.4 章，面板右上常駐）。 */
function Legend() {
  const t = useT();
  return (
    <span className="jf-legend">
      <svg viewBox="0 0 14 14" aria-hidden focusable="false">
        <circle cx="7" cy="7" r="6" fill="var(--k-window, #ffe2c0)" opacity=".55" />
        <path d="M7 1a6 6 0 0 1 0 12z" fill="var(--cine-bg, #06080b)" />
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      {t('影子＝懷疑')}
    </span>
  );
}

export interface JuryMember {
  id: string;
  label: string;
}

/**
 * 陪審團面板（設定集第 8.4、8.5、10.1 章）：桌機 2×6（56×70），手機 6×2（48×60），
 * 每張卡下一條刻痕軌道（五格量化）；「顯示數值」才出數字，過門檻粗體＋▲＋軌道填滿＋門檻線。
 * 不顯示百分比，沒有紅綠表情。
 * collapsible：手機上收成 358×44 的刻痕條，整條點開。
 */
export function JuryBox({
  episode,
  jurors,
  jury,
  deltas,
  eventKey,
  threshold,
  summary,
  collapsible = false,
}: {
  episode: string;
  jurors: readonly JuryMember[];
  jury: Jury;
  deltas: Jury;
  /** 每一步都不同的鍵（筆錄句數）：deltas 只在它變了的時候算一次事件。 */
  eventKey: number;
  threshold: number;
  /** 標題列右邊的一句（「0 / 12 傾向有罪」只在顯示數值時出現）。 */
  summary?: string;
  collapsible?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  const { showNumbers, set } = useSettings();
  const [open, setOpen] = useState(!collapsible);

  // 事件：這一步的 deltas 一次性觸發點頭與 J4（照「由 props 推導狀態」寫法，句數變了才算一次）。
  const [ev, setEv] = useState({
    key: eventKey,
    notes: {} as Record<string, number>,
    nods: {} as Record<string, number>,
  });
  if (ev.key !== eventKey) {
    const notes = { ...ev.notes };
    const nods = { ...ev.nods };
    for (const j of jurors) {
      const d = deltas[j.id] ?? 0;
      if (d <= NOTES_AT) notes[j.id] = eventKey;
      else if (d <= NOD_AT) nods[j.id] = (nods[j.id] ?? 0) + 1;
    }
    setEv({ key: eventKey, notes, nods });
  }
  // J4 兩秒後回到原姿勢。
  const [now, setNow] = useState(eventKey);
  useEffect(() => {
    const id = setTimeout(() => setNow(ev.key), NOTES_MS);
    return () => clearTimeout(id);
  }, [ev.key]);
  const writing = (id: string) => ev.notes[id] === ev.key && now !== ev.key;
  const nods = ev.nods;

  const name = (label: string) => {
    const i = label.lastIndexOf('・');
    return t(i > 0 ? label.slice(0, i) : label, scope);
  };
  const seat = (i: number) => String(i + 1).padStart(2, '0');
  const toggle = (
    <label className="toggle">
      <input
        type="checkbox"
        checked={showNumbers}
        onChange={(e) => set({ showNumbers: e.target.checked })}
      />
      {t('顯示數值')}
    </label>
  );

  if (collapsible && !open)
    return (
      <section className="jurybox collapsed" aria-label={t('陪審團')}>
        <p className="jb-strip-head" aria-hidden>
          <span>{t('陪審團（收合）')}</span>
          <span>{t('點開看臉')}</span>
        </p>
        <button
          type="button"
          className="jb-strip"
          aria-expanded={false}
          aria-label={t('陪審團（收合）・點開看臉')}
          onClick={() => setOpen(true)}
        >
          {jurors.map((j) => (
            <span
              key={j.id}
              className="jb-seg"
              style={{ '--tick': tick(jury[j.id] ?? 0) } as CSSProperties}
            />
          ))}
        </button>
      </section>
    );

  return (
    <section className="jurybox" aria-label={t('陪審團')}>
      <div className="jb-head">
        <h2>
          {collapsible ? (
            <button type="button" className="link" aria-expanded onClick={() => setOpen(false)}>
              {t('陪審團')} ▾
            </button>
          ) : (
            t('陪審團')
          )}
          {showNumbers && summary && <span className="muted"> {summary}</span>}
        </h2>
        <Legend />
      </div>
      <ul className="jb-grid">
        {jurors.map((j, i) => {
          const v = jury[j.id] ?? 0;
          const over = v >= threshold;
          return (
            <li key={j.id} className="jb-cell" title={name(j.label)}>
              <JurorFace
                look={lookOf(episode, j.id)}
                v={v}
                seat={seat(i)}
                notes={writing(j.id)}
                nod={nods[j.id]}
              />
              <span
                className={showNumbers ? (over ? 'jb-track th over' : 'jb-track th') : 'jb-track'}
                style={{ '--tick': tick(v), '--th': threshold } as CSSProperties}
                aria-hidden
              />
              {showNumbers && (
                <span className={over ? 'jb-num over' : 'jb-num'}>
                  {over && '▲'}
                  {v}
                </span>
              )}
              <span className="sr-only">
                {t('{seat} 號 {name}：{posture}', {
                  seat: seat(i),
                  name: name(j.label),
                  posture: t(POSTURE[writing(j.id) ? 'J4' : poseFor(v)]),
                })}
                {showNumbers && `，${v}`}
              </span>
            </li>
          );
        })}
      </ul>
      {toggle}
    </section>
  );
}
