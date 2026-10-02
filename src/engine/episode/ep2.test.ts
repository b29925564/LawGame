import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { matches } from './branch';
import { branchContext, courtArgs, heldArgs } from '../game';
import type { InterviewScene } from './schema';

const ep = episodes.ep2;
const scene = (id: string) => ep.scenes.find((s) => s.id === id)!;
const base = { episode: 'ep2', scene: 0, step: 0, choices: {}, cards: [], scenes: {} };

describe('第 2 集庭審', () => {
  it('費雪被排除就跳過她那場、改由唐醫師作證；沒排除則相反', () => {
    const fisher = scene('court-fisher');
    const doctor = scene('court-doctor');
    expect('when' in fisher && fisher.when).toBeTruthy();
    const on = branchContext({ ...base, flags: ['daubert-fisher'] });
    const off = branchContext({ ...base, flags: [] });
    const w = (s: typeof fisher) => ('when' in s ? s.when : undefined);
    expect(matches(w(fisher), on)).toBe(false);
    expect(matches(w(doctor), on)).toBe(true);
    expect(matches(w(fisher), off)).toBe(true);
    expect(matches(w(doctor), off)).toBe(false);
  });

  it('發問與反詰問的是奧卡福，不是第 1 集的檢察官', () => {
    for (const s of ep.scenes)
      if (s.type === 'trial' || s.type === 'defense') expect(s.examiner).toBe(ep.counsel);
    expect(ep.counsel).not.toBe(episodes.ep1.counsel);
  });
});

describe('第 2 集審前聲請', () => {
  it('調查階段推出的論點 C，審前聲請的支撐清單也看得到', () => {
    const ids = heldArgs({ ...base, cards: ['arg-c', 'fisher-sample'] }).map((a) => a.id);
    expect(ids).toContain('arg-c');
  });

  it('沒聲請 Daubert 也能在庭上用論點 C 拆費雪；我方的風險評估仍然不能出示', () => {
    const ids = courtArgs({ ...base, cards: ['arg-a', 'arg-c', 'arg-e', 'arg-f'] }).map(
      (a) => a.id,
    );
    expect(ids).toEqual(expect.arrayContaining(['arg-a', 'arg-c']));
    expect(ids).not.toContain('arg-e');
    expect(ids).not.toContain('arg-f');
  });
});

describe('訪談筆錄', () => {
  it('玩家選的問題和施壓都會留在筆錄裡，排在證人回答前面', async () => {
    const iv = await import('./interview');
    const s = episodes.ep1.scenes.find((x) => x.id === 'meet-ethan') as InterviewScene;
    const t = s.topics[0];
    let st = iv.ask(s, iv.startInterview(s), t.id);
    expect(st.log.slice(-t.lines.length - 1)[0]).toMatchObject({ who: '盧卡斯', text: t.label });
    const p = s.press[0];
    st = iv.press(s, st, p.id, []);
    expect(st.log.find((l) => l.text === p.label)?.who).toBe('盧卡斯');
  });
});
