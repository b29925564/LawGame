import { describe, expect, it } from 'vitest';
import { lineBreaks, splitCards } from './subtitleSplit';

describe('字幕拆卡', () => {
  it('短句一張卡', () => {
    expect(splitCards('我沒有看到他。', 20)).toEqual([{ text: '我沒有看到他。', from: 0 }]);
  });
  it('中文長句每張最多兩行，不截斷，拼回來等於原文', () => {
    const s =
      '當晚十點四十七分我在三十一樓的影印室，聽見隔壁傳來重物倒地的聲音，但是我以為只是有人在搬東西，所以沒有出去看。';
    const cards = splitCards(s, 12);
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) expect(lineBreaks(c.text, 12).length).toBeLessThanOrEqual(2);
    expect(cards.map((c) => c.text).join('')).toBe(s);
    expect(cards[1].from).toBeGreaterThan(0);
  });
  it('標點不放行首', () => {
    const lines = lineBreaks('一二三四五六七八九十。', 10);
    expect(lines.every((l) => !/^[。，]/.test(l))).toBe(true);
  });
  it('一張裡有句號，兩半放得進一行就在句號後換行', () => {
    const cards = splitCards(
      '死者倒在辦公桌旁，頭部有重擊傷。桌上的水晶獎盃掉在地毯上，上面有血。',
      20,
    );
    expect(cards.length).toBe(1);
    expect(lineBreaks(cards[0].text, 20).length).toBeLessThanOrEqual(2);
    expect(cards[0].text).toContain('傷。');
  });
  it('英文只在空白斷，拼回來等於原文', () => {
    const s =
      'I was in the copy room on the thirty-first floor when I heard something heavy fall next door.';
    const cards = splitCards(s, 20);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
  });
});
