import { useEffect } from 'react';
import { episodes } from '../content';
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
import { Announcer } from './Marks';
import { Negotiation } from './Negotiation';
import { Phone } from './Phone';
import { Intro, VerdictScreen } from './Scenes';
import { Title } from './Title';
import { Defense } from './Defense';
import { Opening, Theory } from './Theory';
import { VoirDire } from './VoirDire';
import { useT } from '../i18n';
import { SceneScope, useDocumentLang } from './lang';

export function App() {
  const { mode, progress, loadId, advance, toTitle, nextEpisode } = useEpisode();
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
  const next = scene ? null : followingEpisode(progress);
  // 讀同一場的存檔也要重新掛載，元件裡的狀態（例如訪談的「結束會見」）才會重置。
  const sceneKey = `${loadId}:${scene?.id}`;
  return (
    <SceneScope.Provider value={scene?.id}>
      <Announcer />
      <GameMenu />
      {scene?.type === 'phone' && <Phone key={sceneKey} scene={scene} />}
      {scene?.type === 'dialogue' && <Dialogue key={sceneKey} scene={scene} />}
      {scene?.type === 'interview' && <Interview key={sceneKey} scene={scene} />}
      {scene?.type === 'desk' && <Desk key={sceneKey} scene={scene} />}
      {scene?.type === 'trial' && <Courtroom key={sceneKey} scene={scene} />}
      {scene?.type === 'deposition' && <Deposition key={sceneKey} scene={scene} />}
      {scene?.type === 'negotiation' && <Negotiation key={sceneKey} scene={scene} />}
      {scene?.type === 'voirdire' && <VoirDire key={sceneKey} scene={scene} />}
      {scene?.type === 'defense' && <Defense key={sceneKey} scene={scene} />}
      {scene?.type === 'theory' && <Theory key={sceneKey} scene={scene} />}
      {scene?.type === 'opening' && <Opening key={sceneKey} scene={scene} />}
      {scene?.type === 'closing' && <Closing key={sceneKey} scene={scene} />}
      {(!scene || scene.type === 'card') && (
        <main className="scene title-card">
          {/* 本集完：眉標寫是哪一集，不跟大標重複（體驗評測 v88）。 */}
          <p className="eyebrow">
            {scene
              ? t(scene.act)
              : `${t('第 {n} 集', { n: episodeOf(progress).number })}・${t(episodeOf(progress).title)}`}
          </p>
          <h1>{t(scene?.type === 'card' ? scene.title : '本集完', scene?.id)}</h1>
          {scene?.type === 'card' && scene.lines.map((l) => <p key={l}>{t(l, scene.id)}</p>)}
          {scene ? (
            <button className="primary" onClick={advance}>
              {t('繼續')}
            </button>
          ) : (
            <div className="stack">
              {next && (
                <button className="primary" onClick={nextEpisode}>
                  {t('繼續第 {n} 集', { n: episodes[next as keyof typeof episodes].number })}
                </button>
              )}
              <button className={next ? '' : 'primary'} onClick={toTitle}>
                {t('回標題')}
              </button>
            </div>
          )}
        </main>
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
