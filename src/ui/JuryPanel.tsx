import { reaction, type Jury } from '../engine/jury';
import { useSettings } from '../engine/settings';
import { episode } from '../engine/store';
import { JuryLegend } from './JuryLegend';

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
  const { showNumbers, set } = useSettings();
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
          <input
            id="show-numbers"
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => set({ showNumbers: e.target.checked })}
          />
          顯示數值
        </label>
      </div>
      {showNumbers && (
        <JuryLegend
          jury={jury}
          threshold={episode.threshold}
          note="原型是從檢方舉證完畢開始，所以一開始所有人都在線上，你要把他們拉下來。"
        />
      )}
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
