import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { excerpt } from '../engine/episode/defense';
import type { DefenseScene, Episode } from '../engine/episode/schema';
import { useT } from '../i18n';
import { reducedMotion } from './a11y';
import { IdPhoto } from './IdPhoto';
import { useScope } from './lang';
import './prep.css';

type Option = DefenseScene['prep']['options'][number];

/**
 * 夾在卡上的取證筆錄影本（P2-9 §3）：筆錄元件的縮小版，只印三行，頁碼行號取自錄取劇本。
 * 沒有任何說明字、顏色或記號：他要背的那句話旁邊就是他宣誓過的筆錄，這就是提示。
 */
function CopySheet({ ep, o }: { ep: Episode; o: Option }) {
  const t = useT();
  const scope = useScope();
  const ex = o.transcript ? excerpt(ep, o.transcript) : null;
  if (!ex) return null;
  return (
    <figure className="prep-copy" aria-label={t('取證筆錄影本')}>
      <span className="pclip" aria-hidden />
      <figcaption>
        <span className="vol">{t('{name}　錄取逐字稿', { name: t(ex.witness, scope) })}</span>
        <span className="pg">{t('第 {n} 頁', { n: ex.page })}</span>
        <span className="oath">{t('本人宣誓所言屬實')}</span>
      </figcaption>
      <ol>
        {ex.rows.map((r) => (
          <li key={r.line} value={r.line}>
            <span className="ln">{r.line}</span>
            <span className="tx">
              {t(r.who === 'q' ? '問：{text}' : '答：{text}', { text: t(r.text, scope) })}
            </span>
          </li>
        ))}
      </ol>
    </figure>
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
            {opts.map((o, i) => {
              const on = pick === o.id;
              return (
                <div
                  key={o.id}
                  ref={(el) => {
                    refs.current[o.id] = el;
                  }}
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (!pick && i === 0) ? 0 : -1}
                  className={`prep-card${on ? ' picked' : ''}${going && !on ? ' out' : ''}${o.transcript ? ' clipped' : ''}`}
                  onClick={() => !going && setPick(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      if (!going) setPick(o.id);
                    } else move(e, i);
                  }}
                >
                  <div className="card-paper">
                    <b className="label">{t(o.label, scope)}</b>
                    <span className="detail">{t(o.detail, scope)}</span>
                  </div>
                  <CopySheet ep={ep} o={o} />
                </div>
              );
            })}
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
