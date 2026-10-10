import { useEffect } from 'react';
import { episodes } from '../content';
import { batesAt } from '../engine/bates';
import { episodeOf, followingEpisode, sceneOf, useEpisode } from '../engine/game';
import { useSettings } from '../engine/settings';
import { useGame } from '../engine/store';
import { Board } from './Board';
import { Court } from './Court';
import { Closing } from './Closing';
import { Courtroom } from './Courtroom';
import { Deposition } from './Deposition';
import { Desk } from './Desk';
import { Dialogue } from './Dialogue';
import { GameMenu } from './GameMenu';
import { Interview } from './Interview';
import { ActCard, PlaceSlate, Recap, splitHeadline } from './ActCard';
import { Announcer } from './Marks';
import { Negotiation } from './Negotiation';
import { Phone } from './Phone';
import { ScenePhotos } from './ScenePhotos';
import { Intro, VerdictScreen } from './Scenes';
import { Title } from './Title';
import { Defense } from './Defense';
import { Opening, Theory } from './Theory';
import { VoirDire } from './VoirDire';
import { useT } from '../i18n';
import { SceneScope, useDocumentLang } from './lang';
import { prose } from './prose';

export function App() {
  const { mode, progress, advance, toTitle, nextEpisode } = useEpisode();
  const textScale = useSettings((s) => s.textScale);
  const t = useT();
  useDocumentLang();
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(textScale));
  }, [textScale]);

  if (mode === 'title') return <Title />;
  if (mode === 'proto')
    return (
      <>
        <button className="link back" onClick={toTitle}>
          ← {t('回標題')}
        </button>
        <Prototype />
      </>
    );

  const scene = sceneOf(progress);
  const ep = episodeOf(progress);
  // 集尾卡（這一集最後一場是卡）：跑完進場、停 2.5 秒後不切場，選項出現在卡下。
  const last = scene?.type === 'card' && progress.scene === ep.scenes.length - 1;
  const next = scene && !last ? null : followingEpisode(progress);
  // 幕卡（設定集 11.3）：片頭卡的集名寫在第一行；同一幕的第二張卡是日卡；集尾也是同一個版型。
  const card = scene?.type === 'card' ? scene : null;
  const opening = card?.act === '片頭';
  const prevCard = ep.scenes
    .slice(0, progress.scene)
    .reverse()
    .find((x) => x.type === 'card');
  const day = !!card && prevCard?.type === 'card' && prevCard.act === card.act;
  const headline = !scene
    ? { kicker: t('第 {n} 集', { n: ep.number }), title: t('本集完') }
    : card
      ? splitHeadline(
          opening ? t(card.lines[0], card.id) : t(card.title, card.id),
          day ? 'day' : 'act',
        )
      : { kicker: '', title: '' };
  // 場記：這張卡之後第一個有地點的場景；後面沒有就用前面最後一個。
  const placed = (list: typeof ep.scenes) =>
    list.find((x): x is typeof x & { place: string } => 'place' in x && !!x.place);
  const at = progress.scene;
  const where = card
    ? (placed(ep.scenes.slice(at + 1)) ?? placed(ep.scenes.slice(0, at).reverse()))
    : placed(ep.scenes.slice().reverse());
  const slate = where && { raw: where.place, text: t(where.place, where.id) };
  // 地點字卡：換了地點、前一場又不是幕卡（幕卡自己有場記）時，左下一行場記。
  const here = scene && 'place' in scene && scene.place ? scene.place : '';
  const before = ep.scenes[at - 1];
  const moved =
    !!here && before?.type !== 'card' && placed(ep.scenes.slice(0, at).reverse())?.place !== here;
  const page = batesAt(ep, at);
  return (
    <SceneScope.Provider value={scene?.id}>
      <Announcer />
      <GameMenu />
      <PlaceSlate id={scene?.id} place={moved ? { raw: here, text: t(here, scene?.id) } : null} />
      {scene?.type === 'phone' && <Phone key={scene.id} scene={scene} />}
      {scene?.type === 'dialogue' && <Dialogue key={scene.id} scene={scene} />}
      {scene?.type === 'interview' && <Interview key={scene.id} scene={scene} />}
      {scene?.type === 'desk' && <Desk key={scene.id} scene={scene} />}
      {scene?.type === 'trial' && <Courtroom key={scene.id} scene={scene} />}
      {scene?.type === 'deposition' && <Deposition key={scene.id} scene={scene} />}
      {scene?.type === 'negotiation' && <Negotiation key={scene.id} scene={scene} />}
      {scene?.type === 'voirdire' && <VoirDire key={scene.id} scene={scene} />}
      {scene?.type === 'defense' && <Defense key={scene.id} scene={scene} />}
      {scene?.type === 'theory' && <Theory key={scene.id} scene={scene} />}
      {scene?.type === 'opening' && <Opening key={scene.id} scene={scene} />}
      {scene?.type === 'closing' && <Closing key={scene.id} scene={scene} />}
      {scene?.type === 'card' && !last && progress.step === 0 && (
        <ActCard key={scene.id} headline={headline} place={slate} bates={page} onDone={advance} />
      )}
      {scene?.type === 'card' && !last && progress.step === 1 && scene.photos && (
        <ScenePhotos photos={scene.photos} onNext={advance} />
      )}
      {(!scene || last) && (
        <ActCard
          key={scene?.id ?? 'end'}
          headline={headline}
          place={slate}
          bates={page}
          lines={!last && <Recap />}
        >
          {/* 集尾卡的那一句（「第 1 集到此結束。」）沒有下一場可以放，和選項一起出現在卡下。 */}
          {last &&
            card?.lines.map((l) => (
              <p key={l} className="narration">
                {prose(t(l, card?.id))}
              </p>
            ))}
          <div className="stack">
            {next && (
              <button
                className="primary"
                onClick={() => {
                  if (last) advance();
                  nextEpisode();
                }}
              >
                {t('繼續第 {n} 集', { n: episodes[next as keyof typeof episodes].number })}
              </button>
            )}
            <button
              className={next ? '' : 'primary'}
              onClick={() => {
                if (last) advance();
                toTitle();
              }}
            >
              {t('回標題')}
            </button>
          </div>
        </ActCard>
      )}
    </SceneScope.Provider>
  );
}

function Prototype() {
  const phase = useGame((s) => s.phase);
  switch (phase) {
    case 'intro':
      return <Intro />;
    case 'board':
      return <Board />;
    case 'court':
      return <Court />;
    case 'verdict':
      return <VerdictScreen />;
  }
}
