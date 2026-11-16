import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { courtScene } from '../game';
import type { Progress } from '../save';
import { startDesk } from './desk';
import type { DeskScene, TrialScene, VoirDireScene } from './schema';
import { startTrial } from './trial';
import { startVoirDire } from './voirdire';

/** #383：遴選失誤和動議駁回都扣，只扣開庭第一天；第 2、3 天從劇本的耐心開始。 */
describe.each(['ep1', 'ep2'] as const)('法官起始耐心（%s）', (id) => {
  const ep = episodes[id];
  const vd = ep.scenes.find((s) => s.type === 'voirdire') as VoirDireScene;
  const desks = ep.scenes.filter((s): s is DeskScene => s.type === 'desk');
  const trials = ep.scenes.filter((s): s is TrialScene => s.type === 'trial');
  const base = (scenes: Progress['scenes'], flags: string[] = []): Progress => ({
    episode: id,
    scene: 0,
    step: 0,
    choices: {},
    cards: [],
    flags: [],
    ethics: [],
    scenes: {
      [vd.id]: { ...startVoirDire(vd), seated: [], wrong: 2 },
      [desks[0].id]: { ...startDesk(desks[0]), flags },
      ...scenes,
    },
  });
  // 沒有遴選失誤、沒有動議駁回時的耐心（開示等其他代價照算），當作比較基準。
  const plain = (p: Progress, t: TrialScene) =>
    courtScene(
      {
        ...p,
        scenes: {
          ...p.scenes,
          [vd.id]: { ...startVoirDire(vd), seated: [], wrong: 0 },
          [desks[0].id]: startDesk(desks[0]),
        },
      },
      t,
    ).patience;

  it('第一天：遴選失誤 2 次加動議駁回，少 3 點', () => {
    const p = base({}, ['motion-denied']);
    expect(courtScene(p, trials[0]).patience).toBe(Math.max(1, plain(p, trials[0]) - 3));
  });

  it('沒有動議駁回：只扣遴選失誤', () => {
    const p = base({});
    expect(courtScene(p, trials[0]).patience).toBe(Math.max(1, plain(p, trials[0]) - 2));
  });

  it('之後的開庭日不重扣', () => {
    expect(trials.length).toBeGreaterThan(1);
    const done = Object.fromEntries(trials.slice(0, -1).map((t) => [t.id, startTrial(t)]));
    const p = base(done, ['motion-denied']);
    for (const t of trials.slice(1)) expect(courtScene(p, t).patience).toBe(plain(p, t));
  });
});
