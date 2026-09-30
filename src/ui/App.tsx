import { useGame } from '../engine/store';
import { Board } from './Board';
import { Court } from './Court';
import { Intro, VerdictScreen } from './Scenes';

export function App() {
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
