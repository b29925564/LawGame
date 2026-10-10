import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import {
  batesAt,
  cardBates,
  cardIn,
  ownBates,
  PAGES,
  pagesOf,
  provenanceOf,
  totalPages,
} from './bates';
import type { BranchContext } from './episode/branch';
import { validateEpisode } from './episode/validate';

const ctx = (flags: string[] = []): BranchContext => ({
  verdict: null,
  outcome: null,
  deal: null,
  theory: null,
  flags,
  ethics: [],
  cards: [],
  presented: [],
});

describe('本所序列 WH-E0n', () => {
  it('格式是集數加六位數（設定集第 10 章 :17）', () => {
    expect(ownBates(1, 214)).toBe('WH-E01-000214');
    expect(ownBates(2, 1)).toBe('WH-E02-000001');
  });

  for (const ep of Object.values(episodes))
    it(`第 ${ep.number} 集的頁段從 1 起、一場接一場、不重疊`, () => {
      let next = 1;
      ep.scenes.forEach((s, at) => {
        const { first, count } = pagesOf(ep, at);
        expect(first).toBe(next);
        expect(count).toBe(PAGES[s.type]);
        next = first + count;
      });
      expect(totalPages(ep)).toBe(next - 1);
      // 頁段只看劇本：同一場永遠是同一個號碼。
      expect(batesAt(ep, 3)).toBe(ownBates(ep.number, pagesOf(ep, 3).first));
    });

  it('第幾張紙超過那一場的頁數時，停在最後一頁，不會撞到下一場', () => {
    const ep = episodes.ep1;
    const at = ep.scenes.findIndex((s) => s.type === 'trial');
    const { first, count } = pagesOf(ep, at);
    expect(batesAt(ep, at, 1)).toBe(ownBates(1, first));
    expect(batesAt(ep, at, count + 5)).toBe(ownBates(1, first + count - 1));
  });
});

describe('文件 Bates 與出處', () => {
  it('群組截圖的 Bates 跟著分支換交出方', () => {
    const c = cardIn(episodes.ep2, 'chat-peak')!;
    expect(cardBates(c, ctx())).toBe('CALDER-003005');
    expect(cardBates(c, ctx(['discovery:rq-chat:concealed']))).toBe('OKF-000611');
  });

  it('每種紙印它自己的出處', () => {
    const p = (ep: keyof typeof episodes, id: string) =>
      provenanceOf(cardIn(episodes[ep], id)!, ctx());
    // 財物清單本身印清單的號碼；照片的號碼印在沖印本上。
    expect(p('ep1', 'watch-listed')).toEqual({ kind: 'bates', bates: 'CPD-000021' });
    expect(cardIn(episodes.ep1, 'watch-listed')!.photo?.bates).toBe('CPD-000024');
    expect(p('ep1', 'watch-photo')).toBeNull();
    expect(p('ep2', 'errata')).toEqual({ kind: 'cite', page: 42, line: 7 });
    expect(p('ep2', 'complaint')?.kind).toBe('filed');
    expect(p('ep1', 'ethan-accused')).toEqual({
      kind: 'taken',
      at: '03/16 10:30',
      by: '盧卡斯・葛雷　會見筆記',
    });
  });
});

describe('驗證器', () => {
  const errs = (edit: (e: typeof episodes.ep2) => void) => {
    const e = structuredClone(episodes.ep2);
    edit(e);
    return validateEpisode(e).filter((m) => /Bates|出處|頁行/.test(m));
  };
  const each = (
    e: typeof episodes.ep2,
    id: string,
    f: (c: NonNullable<ReturnType<typeof cardIn>>) => void,
  ) => {
    for (const s of e.scenes) if (s.type === 'desk') for (const c of s.cards) if (c.id === id) f(c);
  };

  it('現在的劇本通過', () => {
    expect(validateEpisode(episodes.ep1)).toEqual([]);
    expect(validateEpisode(episodes.ep2)).toEqual([]);
  });
  it('跨前綴、跨分支查重複：batesIf 撞到錄影的號碼也擋', () => {
    const video = episodes.ep2.scenes.find((s) => s.type === 'deposition' && s.video);
    const taken = video?.type === 'deposition' ? video.video!.bates : '';
    expect(taken).toMatch(/-V-/);
    expect(errs((e) => each(e, 'chat-peak', (c) => (c.batesIf![0].bates = taken)))).toHaveLength(1);
    expect(errs((e) => each(e, 'pharmacy', (c) => (c.bates = 'CALDER-003005')))).toHaveLength(1);
  });
  it('沒有任何出處的紙擋下', () => {
    expect(
      errs((e) =>
        each(e, 'complaint', (c) => {
          delete c.filed;
          delete c.bates;
        }),
      ),
    ).toEqual(['卡片 complaint 沒有出處：要寫 bates、cite、filed 或 taken 其中一項']);
  });
  it('錄取那一題和卡片的頁行要對得上', () => {
    expect(errs((e) => each(e, 'trevor-sworn', (c) => (c.cite = '41:7')))).toHaveLength(1);
  });
});
