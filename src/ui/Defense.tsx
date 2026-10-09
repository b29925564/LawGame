import { useState } from 'react';
import * as defense from '../engine/episode/defense';
import type { DefenseScene } from '../engine/episode/schema';
import { defenseState, juryAfterTrial, useEpisode, witnessScene } from '../engine/game';
import { useT } from '../i18n';
import { termsOf } from '../engine/jury';
import { useScope } from './lang';
import { MarkLines } from './Marks';
import { Speech } from './Portrait';
import { batesOf, CourtRecord, useCourtEntries } from './Record';
import { CourtCast } from './jury/CourtFace';
import { Recap } from './ActCard';

/**
 * 辯方證人（企劃書 6.9.6）：先準備，再直接詰問。
 * 外觀是最小版，版面交給介面串。
 */
/** 法庭畫面：說話者頭像是剪影替身（P4-2）。 */
export function Defense({ scene }: { scene: DefenseScene }) {
  return (
    <CourtCast>
      <DefenseScreen scene={scene} />
    </CourtCast>
  );
}

function DefenseScreen({ scene: raw }: { scene: DefenseScene }) {
  const { progress, prepareWitness, askWitness, finishWitness, advance } = useEpisode();
  // 條件不符的題目（例如證人更正過筆錄）不出現。
  const scene = witnessScene(progress, raw);
  const st = defenseState(progress, scene);
  const t = useT();
  const scope = useScope();
  const [intro, setIntro] = useState(st.stage === 'prep' && st.log.length === 0);
  const rules = juryAfterTrial(progress)?.rules;
  const record = useCourtEntries(st.log, scene.witness.name);
  const bates = batesOf(progress, raw.id);

  if (intro)
    return (
      <main className="scene">
        <p className="eyebrow">
          {t(scene.act, scope)}
          {scene.day ? `・${t(scene.day, scope)}` : ''}
        </p>
        <div className="lines">
          <Recap />
          {scene.intro.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </div>
        <button className="primary next" onClick={() => setIntro(false)}>
          {t('準備{name}出庭', { name: t(scene.witness.name, scope) })}
        </button>
      </main>
    );

  if (st.stage === 'prep')
    return (
      <main className="scene">
        <p className="eyebrow">
          {t('證人準備・{name}（{role}）・{n} 工時', {
            name: t(scene.witness.name, scope),
            role: t(scene.witness.role, scope),
            n: scene.prep.hours,
          })}
        </p>
        <ul className="stack">
          {scene.prep.options.map((o) => (
            <li key={o.id} className="panel">
              <strong>{t(o.label, scope)}</strong>
              <p className="muted">{t(o.detail, scope)}</p>
              <button onClick={() => prepareWitness(o.id)}>{t('就這樣準備')}</button>
            </li>
          ))}
        </ul>
      </main>
    );

  const left = scene.asks - st.asked.length;
  const open = [...scene.questions]
    .filter((q) => left > 0 && !st.asked.includes(q.id))
    .sort((a, b) => a.seq - b.seq);
  return (
    <main className="scene">
      <p className="eyebrow">
        {st.stage === 'direct'
          ? t('直接詰問・{name}', { name: t(scene.witness.name, scope) }) +
            t('・還能問 {n} 題', { n: left })
          : t('交互詰問結束・{name}', { name: t(scene.witness.name, scope) })}
      </p>
      {/* 這裡沒有逐人的數字，只說幾位站在對方那邊；說明數字的圖例會讓人以為數字壞了。 */}
      {rules && (
        <p className="muted small">
          {t('陪審團')}{' '}
          {t('{over} / {total} 傾向{yes}', {
            over: rules.jurors.filter((j) => (st.jury[j.id] ?? 0) >= rules.threshold).length,
            total: rules.jurors.length,
            yes: t(termsOf(rules).yes),
          })}
        </p>
      )}
      {st.log.length > 0 &&
        (st.stage === 'direct' ? (
          <CourtRecord entries={record} live bates={bates} />
        ) : (
          // 詰問結束後整份筆錄攤開，不再擠在小框裡只露半句。
          <CourtRecord entries={record} bates={bates} className="full" />
        ))}
      {st.stage === 'direct' ? (
        <>
          {/* 問過的題目已經在筆錄裡，不再列一次；額度用完就只剩「問完了」，空清單也不畫（體驗評測 v88、v90）。 */}
          {open.length > 0 && (
            <ul className="stack">
              {open.map((q) => (
                <li key={q.id}>
                  <button
                    className="wide"
                    disabled={!defense.canAsk(scene, st, q.id, progress.cards)}
                    onClick={() => askWitness(q.id)}
                  >
                    {t(q.q, scope)}
                  </button>
                  {/* 明知答案是假的還問（ethicsIf 條件成立）：問之前就要看得到風險。 */}
                  {q.ethicsIf && q.ethicsIf.has.every((c) => progress.cards.includes(c)) && (
                    <p className="court-warn small ethics-risk">
                      {t('你手上的證據說這個回答不是真的。照問，是讓證人在庭上說假話。')}
                    </p>
                  )}
                  {defense.missing(scene, q.id, progress.cards).length > 0 && (
                    <p className="muted small">{t('手上沒有能讓證人說這件事的證據。')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button className="primary" onClick={finishWitness}>
            {t('問完了')}
          </button>
        </>
      ) : (
        <>
          <div className="lines">
            <MarkLines lines={scene.outro} />
          </div>
          <button className="primary next" onClick={advance}>
            {t('繼續')}
          </button>
        </>
      )}
    </main>
  );
}
