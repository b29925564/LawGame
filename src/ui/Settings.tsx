import { useSettings } from '../engine/settings';

/** 輔助選項（企劃書 6.14）：字級、異議窗、數值顯示、畫外字幕、音效。 */
export function SettingsPanel() {
  const { objectionSeconds, showNumbers, textScale, sound, voAuto, voScale, voBox, set } =
    useSettings();
  return (
    <div className="stack settings">
      <label>
        字級
        <input
          type="range"
          min="0.9"
          max="1.4"
          step="0.1"
          value={textScale}
          onChange={(e) => set({ textScale: Number(e.target.value) })}
        />
      </label>
      <label>
        異議窗
        <select
          value={objectionSeconds}
          onChange={(e) => set({ objectionSeconds: Number(e.target.value) })}
        >
          <option value={0}>回合制（不計時）</option>
          <option value={4}>4 秒</option>
          <option value={8}>8 秒</option>
          <option value={12}>12 秒</option>
        </select>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showNumbers}
          onChange={(e) => set({ showNumbers: e.target.checked })}
        />
        顯示陪審員數值
      </label>
      <label>
        字幕字級
        <select value={voScale} onChange={(e) => set({ voScale: Number(e.target.value) })}>
          <option value={1}>100%</option>
          <option value={1.25}>125%</option>
          <option value={1.5}>150%</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={voBox} onChange={(e) => set({ voBox: e.target.checked })} />
        字幕底框
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={voAuto}
          onChange={(e) => set({ voAuto: e.target.checked })}
        />
        字幕自動前進
      </label>
      <label className="toggle">
        <input type="checkbox" checked={sound} onChange={(e) => set({ sound: e.target.checked })} />
        音效
      </label>
    </div>
  );
}
