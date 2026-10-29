import { useState } from 'react';
import { optionOpen, useEpisode, sceneChoices } from '../engine/game';
import type { DialogueScene, Line } from '../engine/episode/schema';
import { useT } from '../i18n';
import { useScope } from './lang';
import { LucasStage, Speech } from './Portrait';
import { Transcript } from './Shell';
import { Recap, splitSlate } from './ActCard';
import { SubActions, useSubs } from './SubCard';
import { OnPlate, onPlateOf, PlateEyebrow, usePlate, useScenePlate, useShown } from './scenePlate';

/** 對話場景：一路往下讀，遇到選擇就停。之前的台詞留在畫面上，方便回頭看。 */
export function Dialogue({ scene }: { scene: DialogueScene }) {
  const { progress, advance, choose } = useEpisode();
  const t = useT();
  const scope = useScope();
  // 這一場有底圖就當背景（沒有的場景照舊）：台詞框貼底，讓出上半部給圖。
  const shown = useShown(useScenePlate(progress.episode, scene));
  usePlate(shown, 'scene');
  // 有底圖的場景是字幕模式：畫面下三分之一只留最新一句（最多兩行），前面的台詞收進「筆錄」抽屜（設計師 #296）。
  const [rec, setRec] = useState(false);
  const picks = sceneChoices(progress);
  const lines: Line[] = [];
  for (let i = 0; i <= progress.step && i < scene.steps.length; i++) {
    const s = scene.steps[i];
    if (s.do === 'say') {
      // 整行帶過去：畫外字幕（voice/beats）和記號（mark）要靠這些欄位，只抄 who/text 會變成普通台詞（體驗評測：尾聲露出「｜」）。
      lines.push(s);
    } else if (picks[i] !== undefined) {
      const o = s.options[picks[i]];
      lines.push({ who: '盧卡斯', text: o.text, mood: '平', thought: false }, ...o.then);
    }
  }
  const step = scene.steps[progress.step];
  const choosing = step?.do === 'choose' && picks[progress.step] === undefined;
  const call = scene.call;
  // 打完最後一句：通話結束，螢幕上的通話時間停住。
  const ended = progress.step >= scene.steps.length - 1;
  const latest = lines[lines.length - 1];
  // 畫外字幕、記號、心聲不進字幕框：畫外字幕有自己的一層，記號是手的記號。
  const card = latest && !latest.mark && !latest.thought && latest.voice !== 'off' ? latest : null;
  // 一句拆成幾張時，「繼續」先翻完這一句的卡才往下走。
  const subs = useSubs(shown ? card : null, lines.length, !rec, choosing);
  const action =
    choosing && step.do === 'choose' ? (
      <div
        className="choices"
        role="group"
        aria-label={step.prompt ? t(step.prompt, scope) : t('選擇')}
      >
        {step.prompt && <p className="muted">{t(step.prompt, scope)}</p>}
        {step.options.map((o, i) =>
          optionOpen(progress, o) ? (
            <button key={i} onClick={() => choose(i)}>
              {t(o.text, scope)}
            </button>
          ) : null,
        )}
      </div>
    ) : (
      <button
        className={call ? 'cine-next' : 'primary next'}
        onClick={() => {
          if (shown && !rec && subs.step()) return;
          advance();
        }}
      >
        {t('繼續')}
      </button>
    );

  // 監獄來電（設定集第 3 章第 29 格）：鏡頭層的黑，不跟主題；電話液晶綠（--k-lcd），頭像的位置是一條黑條。
  if (call)
    return (
      <main className="cine call-screen">
        <p className="cine-time">{splitSlate(t(scene.place, scope))[0]}</p>
        <section className="call-lcd" aria-label={t('來電')}>
          <p className="call-from">
            <span className="call-label">{t('來電')}</span>
            <span>{t(call.caller, scope)}</span>
          </p>
          {/* 林肯・高沒有臉：整季只有聲音，頭像的位置是一條黑條（第 6 章）。 */}
          <p className="call-bar">{t('本通話將被錄音')}</p>
          <p className="call-timer">
            <span className="call-label">{ended ? t('通話結束') : t('通話中')}</span>
            {ended && <span className="call-dur">{call.duration}</span>}
          </p>
        </section>
        <Transcript count={lines.length}>
          <Recap />
          {lines.map((l, i) =>
            l.who === '父親' && !l.mark && l.voice !== 'off' && !l.thought ? (
              <p key={i} className="speech call-speech">
                <span className="call-mug" aria-hidden />
                <span>
                  <span className="who">{t(l.who)}</span>
                  {t(l.text, scope)}
                </span>
              </p>
            ) : (
              <Speech key={i} line={l} />
            ),
          )}
        </Transcript>
        {action}
      </main>
    );

  return (
    <OnPlate.Provider value={onPlateOf(shown)}>
      <main
        className={
          shown
            ? rec
              ? 'scene dialogue plated subs rec-open'
              : 'scene dialogue plated subs'
            : 'scene dialogue'
        }
      >
        {/* 眉標和地點字卡左欄讀同一個欄位（設定集 11.3 裁定）。 */}
        {shown ? (
          <PlateEyebrow text={splitSlate(t(scene.place, scope))[0]} />
        ) : (
          <p className="eyebrow">{splitSlate(t(scene.place, scope))[0]}</p>
        )}
        {/* 有底圖時不放盧卡斯大圖：攝影棚光對不上底圖的光；他在畫面裡的位置由立牌負責（設計師 #296）。 */}
        {!shown && <LucasStage lines={lines} />}
        <Transcript count={lines.length} open={!shown || rec}>
          <Recap />
          {lines.map((l, i) => (
            <Speech key={i} line={l} />
          ))}
        </Transcript>
        {shown && !rec && subs.node}
        {shown ? <SubActions action={action} rec={rec} onRec={() => setRec((v) => !v)} /> : action}
      </main>
    </OnPlate.Provider>
  );
}
