import { episode, useGame } from '../engine/store';
import { JuryPanel } from './JuryPanel';

export function Intro() {
  const begin = useGame((s) => s.begin);
  return (
    <main className="scene">
      <p className="eyebrow">原型・灰盒版</p>
      <h1>{episode.title}</h1>
      {episode.intro.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <button className="primary" onClick={begin}>
        打開證據板
      </button>
    </main>
  );
}

export function VerdictScreen() {
  const { cross, board, witnessStart, witnessEnd, restart } = useGame();
  if (!cross) return null;
  const minutes =
    witnessStart && witnessEnd
      ? Math.max(1, Math.round((witnessEnd - witnessStart) / 60000))
      : null;
  return (
    <main className="scene">
      <p className="eyebrow">判決</p>
      <h1>{cross.verdict}</h1>
      <JuryPanel jury={cross.jury} deltas={{}} />
      <section className="panel">
        <h2>評議</h2>
        {cross.rounds.map((r, i) => (
          <div key={i}>
            <strong>第 {i + 1} 輪</strong>
            <ul>
              {r.moves.map((m, k) => (
                <li key={k}>{m}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>這一局的紀錄</h2>
        <dl className="stats">
          <dt>推理鏈提交</dt>
          <dd>
            {board.submissions} 次（錯 {board.wrong} 次）
          </dd>
          <dt>確認的論點</dt>
          <dd>
            {board.confirmed.length} / {episode.questions.length}
          </dd>
          <dt>彈劾成功</dt>
          <dd>
            {cross.impeachments} / {episode.witness.claims.length}
          </dd>
          <dt>剩餘法官耐心</dt>
          <dd>
            {cross.patience} / {episode.patience}
          </dd>
          <dt>詰問瑞秋用時</dt>
          <dd>{minutes ? `約 ${minutes} 分鐘` : '—'}</dd>
        </dl>
      </section>
      <button className="primary" onClick={restart}>
        重新開始
      </button>
    </main>
  );
}
