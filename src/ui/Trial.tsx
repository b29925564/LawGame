import { useState } from 'react';
import { episode, useGame } from '../engine/store';
import { EvidenceList } from './EvidenceList';

export function Trial() {
  const { trial, move, press, present } = useGame();
  const [picking, setPicking] = useState(false);
  const { statements, persuasion, witness } = episode.trial;
  const statement = statements[trial.index];
  const name = episode.characters.find((c) => c.id === witness)!.name;
  const resolved = trial.resolved.includes(statement.id);

  return (
    <main className="scene trial">
      <header className="meter" aria-label="陪審團信任">
        陪審團信任 {'●'.repeat(trial.persuasion)}
        {'○'.repeat(persuasion - trial.persuasion)}
      </header>
      <div className="witness">
        <div className="portrait" aria-hidden>
          {name[0]}
        </div>
        <div>
          <div className="speaker">
            {name}・證詞 {trial.index + 1}/{statements.length}
          </div>
          <p className={resolved ? 'statement resolved' : 'statement'}>{statement.text}</p>
        </div>
      </div>
      {trial.message && <p className="quote">{trial.message}</p>}

      {picking ? (
        <div className="picker">
          <EvidenceList
            onPick={(id) => {
              setPicking(false);
              present(id);
            }}
          />
          <button onClick={() => setPicking(false)}>取消</button>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => move(-1)}>◂ 上一句</button>
          <button onClick={press}>追問</button>
          <button className="primary" onClick={() => setPicking(true)}>
            出示證據
          </button>
          <button onClick={() => move(1)}>下一句 ▸</button>
        </div>
      )}
    </main>
  );
}
