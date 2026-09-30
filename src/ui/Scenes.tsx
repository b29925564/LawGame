import { episode, useGame } from '../engine/store';

export function Title() {
  const newGame = useGame((s) => s.newGame);
  return (
    <main className="scene title">
      <h1>LawGame</h1>
      <p className="subtitle">{episode.title}</p>
      <button className="primary" onClick={newGame}>
        開始新遊戲
      </button>
    </main>
  );
}

export function Incident() {
  const { line, nextLine } = useGame();
  const { speaker, text } = episode.incident[line];
  return (
    <main className="scene incident" onClick={nextLine}>
      <div className="dialogue">
        <div className="speaker">{speaker}</div>
        <p>{text}</p>
        <button className="primary" onClick={(e) => (e.stopPropagation(), nextLine())}>
          繼續 ▸
        </button>
      </div>
    </main>
  );
}

export function Verdict() {
  const { won, trial, goToTrial, backToDesk, newGame } = useGame();
  return (
    <main className="scene verdict">
      <h2>{won ? '勝訴' : '敗訴'}</h2>
      {trial.message && <p className="quote">{trial.message}</p>}
      <p>{won ? episode.trial.verdict.win : episode.trial.verdict.lose}</p>
      {won ? (
        <button className="primary" onClick={newGame}>
          重新開始
        </button>
      ) : (
        <div className="row">
          <button onClick={backToDesk}>回去調查</button>
          <button className="primary" onClick={goToTrial}>
            重新開庭
          </button>
        </div>
      )}
    </main>
  );
}
