import { useGame } from '../engine/store';
import { Board } from './Board';
import { Court } from './Court';
import { Intro, VerdictScreen } from './Scenes';

/** 原型模式（企劃書第 15 節）：只從標題畫面進，延遲載入（Issue #388 P3）。 */
export function Prototype() {
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
