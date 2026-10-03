import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { allFlags, courtScene } from '../game';
import { file, startDesk, supportPool, type DeskState } from './desk';
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

describe('聲請的證物格只列候選，不攤整個證據庫', () => {
  const all = Object.values(episodes) as Episode[];
  const desks = all.flatMap((ep) =>
    ep.scenes
      .filter((s): s is DeskScene => s.type === 'desk')
      .map((s) => ({
        ep,
        s,
        args: ep.scenes.flatMap((x) =>
          x.type === 'desk' ? x.questions.map((q) => q.argument.id) : [],
        ),
      })),
  );

  it('手上什麼都有時：正解、替代卡和誘答都在，其他都不在', () => {
    for (const { s, args } of desks)
      for (const m of s.motions) {
        const offered = [...args, ...s.cards.map((c) => c.id)];
        const pool = supportPool(s, startDesk(s), m.id, offered);
        const answers = [...m.support, ...Object.values(m.accept).flat()];
        for (const x of answers) expect(pool, `${m.id} 少了正解 ${x}`).toContain(x);
        for (const x of m.lures) expect(pool, `${m.id} 少了誘答 ${x}`).toContain(x);
        expect(pool.length, m.id).toBe(new Set([...answers, ...m.lures]).size);
        expect(pool.length, m.id).toBeLessThanOrEqual(7);
      }
  });

  it('正解不會總在同一個位置', () => {
    const at = new Set(
      desks.flatMap(({ s, args }) =>
        s.motions.map((m) => {
          const pool = supportPool(s, startDesk(s), m.id, [...args, ...s.cards.map((c) => c.id)]);
          return pool.indexOf(m.support[0]);
        }),
      ),
    );
    expect(at.size).toBeGreaterThan(1);
  });

  it('手上沒有寫好的論點誘答時，補兩張別的論點，正解論點才不會一眼看出來', () => {
    const { s, args } = desks.find(({ s }) => s.motions.length)!;
    const m = s.motions[0];
    const others = args.filter((a) => !m.lures.includes(a) && !m.support.includes(a));
    const offered = [...m.support, ...others, ...s.cards.map((c) => c.id)];
    const pool = supportPool(s, startDesk(s), m.id, offered);
    expect(pool.filter((x) => others.includes(x))).toEqual(others.slice(0, 2));
  });

  it('已經放進格子的卡一直列著，才能拿出來換', () => {
    const { s, args } = desks.find(({ s }) => s.motions.length)!;
    const m = s.motions[0];
    const stray = s.cards
      .map((c) => c.id)
      .find((c) => !m.lures.includes(c) && !m.support.includes(c))!;
    const st: DeskState = {
      ...startDesk(s),
      motions: {
        [m.id]: { basis: null, request: null, support: [stray], ruling: null, twist: null },
      },
    };
    expect(supportPool(s, st, m.id, [...args, ...s.cards.map((c) => c.id)])).toContain(stray);
  });
});
