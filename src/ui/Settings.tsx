import type { CSSProperties } from 'react';
import { useSettings } from '../engine/settings';
import { useT } from '../i18n';
import { useCourtLight } from './courtLight';
import { LangSwitch } from './lang';
import { usePhotosafe, useReducedMotion } from './a11y';

const VOLUMES = [
  ['master', '總音量'],
  ['music', '音樂'],
  ['sfx', '音效'],
  ['ambience', '環境音'],
] as const;

/** 滑桿已填段的長度：WebKit 沒有填段的偽元素，用漸層畫，位置由這個變數給。 */
const fill = (value: number, min: number, max: number) =>
  ({ '--fill': `${((value - min) / (max - min)) * 100}%` }) as CSSProperties;

/** 輔助選項（企劃書 6.14）：字級、異議窗、數值顯示、畫外字幕、聲音與音量。 */
export function SettingsPanel() {
  const { objectionSeconds, showNumbers, textScale, sound, voAuto, voScale, voBox, set } =
    useSettings();
  const levels = useSettings();
  const t = useT();
  const { on: light, setOn: setLight } = useCourtLight();
  const { on: safe, setOn: setSafe } = usePhotosafe();
  const { on: still, setOn: setStill } = useReducedMotion();
  return (
    <div className="stack settings">
      <LangSwitch />
      <label className="scale">
        {t('字級')}
        <span className="scale-row">
          <input
            type="range"
            min="0.9"
            max="1.5"
            step="0.1"
            value={textScale}
            aria-valuetext={`${Math.round(textScale * 100)}%`}
            style={fill(textScale, 0.9, 1.5)}
            onChange={(e) => set({ textScale: Number(e.target.value) })}
          />
          <output>{Math.round(textScale * 100)}%</output>
        </span>
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
      {/* 兩個獨立開關（設定集 10.6）：只怕閃的人仍然可以保留完整的動態，反之亦然。 */}
      <label className="toggle">
        <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
        {t('光敏安全')}
        <small className="muted">{t('拿掉所有閃爍，燈改成單次漸亮')}</small>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} />
        {t('減少動態')}
        <small className="muted">{t('移動、縮放與推鏡改成淡入或直接切；沒設定時跟隨系統')}</small>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={sound} onChange={(e) => set({ sound: e.target.checked })} />
        {t('聲音')}
      </label>
      {/* 聲音關掉時滑桿還在，只是灰掉：先調好音量再打開也行。 */}
      <fieldset className="volumes" disabled={!sound}>
        <legend className="sr-only">{t('音量')}</legend>
        {VOLUMES.map(([key, name]) => (
          <label key={key}>
            {t(name)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={levels[key]}
              style={fill(levels[key], 0, 1)}
              aria-valuetext={`${Math.round(levels[key] * 100)}%`}
              onChange={(e) => set({ [key]: Number(e.target.value) })}
            />
            <output>{Math.round(levels[key] * 100)}</output>
          </label>
        ))}
      </fieldset>
      <label className="toggle">
        <input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />
        {t('法庭光影（試做）')}
      </label>
    </div>
  );
}
