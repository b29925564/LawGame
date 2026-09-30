import { useGame } from '../engine/store';
import { Desk } from './Desk';
import { Incident, Title, Verdict } from './Scenes';
import { Trial } from './Trial';

export function App() {
  const phase = useGame((s) => s.phase);
  switch (phase) {
    case 'title':
      return <Title />;
    case 'incident':
      return <Incident />;
    case 'desk':
      return <Desk />;
    case 'trial':
      return <Trial />;
    case 'verdict':
      return <Verdict />;
  }
}
