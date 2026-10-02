import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { allFlags, courtScene } from '../game';
import { file, startDesk, type DeskState } from './desk';
import type { DeskScene, Episode, TrialScene } from './schema';
import { validateEpisode } from './validate';

describe('排除專家（Daubert）', () => {
  it('核准後記下旗標，開庭時陪審團起始傾向下降', () => {
    const ep = episodes.ep1 as Episode;
    const at = ep.scenes.findIndex((s) => s.type === 'desk');
    const orig = ep.scenes[at];
    const s = structuredClone(orig) as DeskScene;
    const m = s.motions.find((x) => !x.twist) ?? s.motions[0];
    delete m.twist;
    m.flags = ['daubert-fisher'];
    m.jury = 8;
    ep.scenes[at] = s;
    try {
      let st: DeskState = {
        ...startDesk(s),
        hours: 99,
        motions: {
          [m.id]: {
            basis: m.basis,
            request: m.request,
            support: m.support,
            ruling: null,
            twist: null,
          },
        },
      };
      st = file(s, st, m.id, [...m.needs, ...m.support]);
      expect(st.motions[m.id].ruling).toBe('granted');
      const p = {
        episode: 'ep1',
        scene: at,
        step: 0,
        choices: {},
        cards: [],
        scenes: { [s.id]: st },
      };
      expect(allFlags(p)).toContain('daubert-fisher');
      const trial = ep.scenes.find((x) => x.type === 'trial') as TrialScene;
      const court = courtScene(p, trial);
      court.jurors.forEach((j, i) => expect(j.start).toBe(Math.max(0, trial.jurors[i].start - 8)));
    } finally {
      ep.scenes[at] = orig;
    }
  });

  it('驗證：有對方反擊的動議不能直接帶效果', () => {
    const ep = structuredClone(episodes.ep1) as Episode;
    const s = ep.scenes.find(
      (x) => x.type === 'desk' && x.motions.some((m) => m.twist),
    ) as DeskScene;
    const m = s.motions.find((x) => x.twist)!;
    m.jury = 5;
    expect(validateEpisode(ep)).toContain(
      `動議 ${m.id} 有對方反擊，旗標與陪審團效果要寫在反擊選項裡`,
    );
  });
});
