import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { fits, openQuestions, questionOpen, startDesk, toggleCard } from './desk';
import type { DeskScene, Episode } from './schema';
import { validateEpisode } from './validate';

describe('替代卡', () => {
  it('說得通的替代卡也算對，但同一格不能重複填', () => {
    const alt = { a: ['a2'] };
    expect(fits(['a', 'b'], alt, ['b', 'a2'])).toBe(true);
    expect(fits(['a', 'b'], alt, ['a', 'a2'])).toBe(false);
    expect(fits(['a', 'b'], alt, ['b', 'c'])).toBe(false);
  });
});

describe('疑問的顯示條件', () => {
  const ep = () => structuredClone(episodes.ep1) as Episode;
  const deskOf = (e: Episode) => e.scenes.find((s) => s.type === 'desk') as DeskScene;

  it('unlock 的東西全部到手才出現；看不到的疑問不能填也不能交', () => {
    const s = deskOf(ep());
    const [q1, q2] = s.questions;
    const key = s.cards.find((c) => !c.held)!.id;
    q2.unlock = [key];
    let st = startDesk(s);
    expect(openQuestions(s, st).map((q) => q.id)).not.toContain(q2.id);
    expect(openQuestions(s, st).map((q) => q.id)).toContain(q1.id);
    const tried = toggleCard(s, st, q2.id, q2.answer[0]);
    expect(tried).toBe(st);
    // 前面幕帶進來的也算到手。
    expect(questionOpen(s, st, q2, [key])).toBe(true);
    st = { ...st, marked: [key] };
    expect(questionOpen(s, st, q2)).toBe(true);
    expect(toggleCard(s, st, q2.id, q2.answer[0]).attempts[q2.id].cards).toEqual([q2.answer[0]]);
  });

  it('連出的發現與確認過的論點也能當條件', () => {
    const s = deskOf(ep());
    const [q1, q2] = s.questions;
    q2.unlock = [q1.argument.id];
    const st = startDesk(s);
    expect(questionOpen(s, st, q2)).toBe(false);
    expect(questionOpen(s, { ...st, confirmed: [q1.id] }, q2)).toBe(true);
    const link = s.links[0];
    q2.unlock = [link.id];
    expect(questionOpen(s, { ...st, found: [link.id] }, q2)).toBe(true);
  });

  it('驗證器：條件要存在、拿得到，不能卡在自己的論點上', () => {
    const e = ep();
    const qs = deskOf(e).questions;
    const [first, q2, q3] = qs;
    const q1 = qs[qs.length - 1];
    q1.unlock = ['nope'];
    q2.unlock = [q2.argument.id];
    q3.unlock = [first.argument.id];
    const errs = validateEpisode(e).join('\n');
    expect(errs).toContain(`疑問 ${q1.id} 的顯示條件用了不存在的 nope`);
    expect(errs).toContain(`疑問 ${q2.id} 的顯示條件需要玩家拿不到的 ${q2.argument.id}`);
    expect(errs).not.toContain(`疑問 ${q3.id} 的顯示條件`);
  });
});
