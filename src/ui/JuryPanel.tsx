import { reaction, type Jury } from '../engine/jury';
import { episode, useGame } from '../engine/store';

const glyph: Record<string, string> = {
  點頭: '◡',
  抄筆記: '✎',
  皺眉: '︵',
  看向被告: '→',
  '': '·',
};

/** 12 張臉。預設只看表情；輔助選項才顯示有罪傾向數值。 */
export function JuryPanel({
  jury,
  deltas,
  compact = false,
}: {
  jury: Jury;
  deltas: Jury;
  compact?: boolean;
}) {
  const { showNumbers, toggleNumbers } = useGame();
  return (
    <section className={compact ? 'jury compact' : 'panel jury'} aria-label="陪審團">
      <div className="panel-head">
        <h2>陪審團</h2>
        {compact && (
          <span className="legend" aria-hidden>
            {(['點頭', '抄筆記', '皺眉', '看向被告'] as const).map((r) => (
              <span key={r}>
                {glyph[r]} {r}
              </span>
            ))}
          </span>
        )}
        <label className="toggle">
          <input id="show-numbers" type="checkbox" checked={showNumbers} onChange={toggleNumbers} />
          顯示數值
        </label>
      </div>
      <ul className="jurors">
        {episode.jurors.map((j) => {
          const r = reaction(deltas[j.id] ?? 0);
          const guilty = jury[j.id] >= episode.threshold;
          return (
            <li key={j.id} className={`juror ${r ? 'react' : ''}`} data-reaction={r}>
              <span className="face" aria-hidden>
                {glyph[r]}
              </span>
              <span className="label">{j.label}</span>
              <span className="state">{r || '　'}</span>
              {showNumbers && <span className={guilty ? 'num guilty' : 'num'}>{jury[j.id]}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
