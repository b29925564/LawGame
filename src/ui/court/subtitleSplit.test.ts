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
  it('兩個短句各一行：整句裝一張，句號後硬換行', () => {
    const cards = splitCards(
      '死者倒在辦公桌旁，頭部有重擊傷。桌上的水晶獎盃掉在地毯上，上面有血。',
      20,
    );
    expect(cards.length).toBe(1);
    expect(cards[0].lines).toEqual([
      '死者倒在辦公桌旁，頭部有重擊傷。',
      '桌上的水晶獎盃掉在地毯上，上面有血。',
    ]);
  });
  it('切在標點：每張從句首或子句首開始，短句不拆兩張', () => {
    const s =
      'The victim was on the floor beside his desk with a blunt-force wound to the head. A crystal award from the desk was on the carpet. It had blood on it.';
    const cards = splitCards(s, 30);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
    for (const c of cards) expect(/^[A-Z]/.test(c.text)).toBe(true);
    expect(cards.some((c) => c.text === 'blood on it.')).toBe(false);
  });
  it('只放一行時，長句在逗號切子句，不在句中硬切', () => {
    const s = '死者倒在辦公桌旁，頭部有重擊傷，桌上的水晶獎盃掉在地毯上，上面有血。';
    const cards = splitCards(s, 12, 1);
    expect(cards.map((c) => c.text).join('')).toBe(s);
    for (const c of cards) expect(lineBreaks(c.text, 12).length).toBe(1);
    expect(cards.every((c) => /[，。]$/.test(c.text))).toBe(true);
  });
  it('英文句子之間不會留「counsel.」孤字卡', () => {
    const s = "Overruled. There's nothing wrong with that question, counsel.";
    const cards = splitCards(s, 12);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
    expect(cards.some((c) => c.text === 'counsel.')).toBe(false);
  });
  it('最後一行不留孤字', () => {
    const lines = lineBreaks(
      'A crystal award from the desk was on the carpet. It had blood on it.',
      22,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[lines.length - 1].length).toBeGreaterThan(6);
  });
  it('英文只在空白斷，拼回來等於原文', () => {
    const s =
      'I was in the copy room on the thirty-first floor when I heard something heavy fall next door.';
    const cards = splitCards(s, 20);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
  });
});
