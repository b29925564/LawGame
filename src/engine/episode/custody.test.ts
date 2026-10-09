import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { custodyOf, useEpisode } from '../game';
import { custodyRows, type Bag } from './custody';
import { validateEpisode } from './validate';
import type { DeskScene } from './schema';

const ctx = (cards: string[], flags: string[] = []) => ({
  verdict: null,
  outcome: null,
  deal: null,
  theory: null,
  flags,
  ethics: [],
  cards,
  presented: [],
});
const row = (at: string, from: string, to: string, when?: Bag['custody'][number]['when']) => ({
  at,
  from,
  to,
  purpose: '經手',
  ...(when ? { when } : {}),
});

describe('保管鏈照劇情進度出現', () => {
  const bag: Bag = {
    caseNo: 'X',
    item: '1',
    acquiredBy: '扣押',
    from: '某處',
    desc: '某物',
    custody: [
      row('03/01 09:00', '甲', '乙'),
      row('03/02 09:00', '乙', '丙', { cards: ['done-job'] }),
      row('03/03 09:00', '丙', '乙'),
      row('03/04 09:00', '乙', '丁', { flags: ['later'] }),
    ],
  };
  const done = (c: ReturnType<typeof ctx>) => custodyRows(bag, c).map((r) => r.done);

  it('沒寫條件的行一開始就發生', () => {
    expect(done(ctx([]))[0]).toBe(true);
  });
  it('條件沒成立的那一行和之後的每一行都還沒發生（保管鏈不斷手）', () => {
    expect(done(ctx([]))).toEqual([true, false, false, false]);
    // 後面那一行自己的條件成立了也一樣：前一手還沒交出去。
    expect(done(ctx([], ['later']))).toEqual([true, false, false, false]);
  });
  it('條件成立就一路接下去，直到下一個沒成立的條件', () => {
    expect(done(ctx(['done-job']))).toEqual([true, true, true, false]);
    expect(done(ctx(['done-job'], ['later']))).toEqual([true, true, true, true]);
  });
});

describe('第 1 集的扣押手錶', () => {
  const investigate = episodes.ep1.scenes.find((s) => s.id === 'investigate') as DeskScene;
  const bag = investigate.cards.find((c) => c.id === 'watch-listed')!.bag!;
  const g = () => useEpisode.getState();

  it('沒做手錶鑑識：袋上只有入所扣押那一行', () => {
    g().newGame('ep1');
    useEpisode.setState({ progress: { ...g().progress, cards: ['watch-listed'] } });
    expect(custodyOf(g().progress, bag).map((r) => r.done)).toEqual([true, false, false, false]);
  });
  it('做了手錶鑑識（拿到通知紀錄）：調閱、送鑑、返還都寫上去', () => {
    useEpisode.setState({
      progress: { ...g().progress, cards: ['watch-listed', 'watch-notice'] },
    });
    expect(custodyOf(g().progress, bag).every((r) => r.done)).toBe(true);
    g().toTitle();
  });
});

describe('驗證器', () => {
  const withWhen = (when: object) => {
    const e = structuredClone(episodes.ep1);
    for (const s of e.scenes)
      if (s.type === 'desk')
        s.cards.find((c) => c.id === 'watch-listed')!.bag!.custody[1].when = when;
    return validateEpisode(e).filter((m) => m.includes('保管鏈'));
  };
  it('現在的寫法通過', () => expect(withWhen({ cards: ['watch-notice'] })).toEqual([]));
  it('引用不存在的卡片、依判決分支都擋下', () => {
    expect(withWhen({ cards: ['no-such-card'] })).toHaveLength(1);
    expect(withWhen({ verdict: ['無罪'] })).toHaveLength(1);
  });
});
