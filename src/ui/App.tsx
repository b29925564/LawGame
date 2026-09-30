import { sceneOf, useEpisode } from '../engine/game';
import { useGame } from '../engine/store';
import { Board } from './Board';
import { Court } from './Court';
import { GameMenu } from './GameMenu';
import { Phone } from './Phone';
import { Intro, VerdictScreen } from './Scenes';
import { Title } from './Title';

export function App() {
  const { mode, progress, advance, toTitle } = useEpisode();
  if (mode === 'title') return <Title />;
  if (mode === 'proto')
    return (
      <>
        <button className="link back" onClick={toTitle}>
          ← 回標題
        </button>
        <Prototype />
      </>
    );

  const scene = sceneOf(progress);
  return (
    <>
      <GameMenu />
      {scene?.type === 'phone' ? (
        <Phone key={scene.id} scene={scene} />
      ) : (
        <main className="scene title-card">
          <p className="eyebrow">{scene?.act ?? '本集完'}</p>
          <h1>{scene?.type === 'card' ? scene.title : '本集完'}</h1>
          {scene?.type === 'card' && scene.lines.map((l) => <p key={l}>{l}</p>)}
          {scene ? (
            <button className="primary" onClick={advance}>
              繼續
            </button>
          ) : (
            <button className="primary" onClick={toTitle}>
              回標題
            </button>
          )}
        </main>
      )}
    </>
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
