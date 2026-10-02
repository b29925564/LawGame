import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { LangSwitch } from './lang';

/** 輔助選項（企劃書 6.14）：字級、異議窗、數值顯示、畫外字幕、音效。 */
export function SettingsPanel() {
  const { objectionSeconds, showNumbers, textScale, sound, voAuto, voScale, voBox, set } =
    useSettings();
  const t = useT();
  return (
    <div className="stack settings">
      <LangSwitch />
      <label>
        {t('字級')}
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
        {t('異議窗')}
        <select
          value={objectionSeconds}
          onChange={(e) => set({ objectionSeconds: Number(e.target.value) })}
        >
          <option value={0}>{t('回合制（不計時）')}</option>
          <option value={4}>{t('{n} 秒', { n: 4 })}</option>
          <option value={8}>{t('{n} 秒', { n: 8 })}</option>
          <option value={12}>{t('{n} 秒', { n: 12 })}</option>
        </select>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={showNumbers}
          onChange={(e) => set({ showNumbers: e.target.checked })}
        />
        {t('顯示陪審員數值')}
      </label>
      <label>
        {t('字幕字級')}
        <select value={voScale} onChange={(e) => set({ voScale: Number(e.target.value) })}>
          <option value={1}>100%</option>
          <option value={1.25}>125%</option>
          <option value={1.5}>150%</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={voBox} onChange={(e) => set({ voBox: e.target.checked })} />
        {t('字幕底框')}
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={voAuto}
          onChange={(e) => set({ voAuto: e.target.checked })}
        />
        {t('字幕自動前進')}
      </label>
      <label className="toggle">
        <input type="checkbox" checked={sound} onChange={(e) => set({ sound: e.target.checked })} />
        {t('音效')}
      </label>
    </div>
  );
}
