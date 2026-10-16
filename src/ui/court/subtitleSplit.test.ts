import { describe, expect, it } from 'vitest';
import { lineBreaks, splitCards, subEm } from './subtitleSplit';

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
  it('英文在詞界斷：卡片不停在冠詞、所有格、介系詞上', () => {
    const s = 'The victim was on the floor beside his desk with a blunt-force wound to the head.';
    const stop =
      /\b(a|an|the|this|that|these|those|his|her|its|their|my|your|our|with|beside|on|in|at|to|of|from|for|by|into|onto)$/i;
    for (const em of [14, 16, 18, 20, 24, 30]) {
      const cards = splitCards(s, em, 1);
      expect(cards.map((c) => c.text).join(' ')).toBe(s);
      for (const c of cards.slice(0, -1)) expect(stop.test(c.text)).toBe(false);
      for (const c of cards) expect(c.text.split(' ').length).toBeGreaterThanOrEqual(2);
    }
  });
  it('英文只在空白斷，拼回來等於原文', () => {
    const s =
      'I was in the copy room on the thirty-first floor when I heard something heavy fall next door.';
    const cards = splitCards(s, 20);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
  });

  it('「Mr.」的句點不當句尾，稱謂不單獨成張', () => {
    for (const em of [10, 14, 20]) {
      const cards = splitCards(
        'Mr. Grey asked whether the photos were taken by Officer Daniel Park.',
        em,
        1,
      );
      expect(cards[0].text).not.toBe('Mr.');
      expect(cards.every((c) => !/^(Mr|Daniel)\.?$/.test(c.text))).toBe(true);
    }
  });

  it('英文：數字、頭銜、連字號修飾語不和後面拆開，尾巴不單獨一個字', () => {
    const t =
      'Mr. Grey asked whether the 31 photos were taken by Officer Daniel Park and whether they showed the whole scene. The victim had a blunt-force wound to the head.';
    for (const em of [11, 12, 14, 16, 20, 24]) {
      const joined = splitCards(t, em, 1).map((c) => c.text);
      const bad = joined.filter(
        (c) => /(\b31|Officer|Daniel|blunt-force)$/.test(c) || !/\s/.test(c),
      );
      expect(bad).toEqual([]);
    }
  });

  it('最窄的手機（390 寬）特寫 150% 字級，一行仍有 12 em 以上', () => {
    expect(subEm(390, 17 * 1.5)).toBeGreaterThanOrEqual(12);
    expect(subEm(412, 17 * 1.5)).toBeGreaterThanOrEqual(12);
  });
});

describe('手機插入鏡頭：一行一張', () => {
  const em = 18;
  const long =
    '死者倒在辦公桌旁，頭部有重擊傷。桌上的水晶獎盃掉在地毯上，上面有血，旁邊還有一支沒蓋上的筆，筆尖是濕的。';
  it('每張只佔一行，切在標點，沒有只剩兩三個字的尾卡', () => {
    const cards = splitCards(long, em, 1);
    expect(cards.length).toBeGreaterThan(2);
    for (const c of cards) {
      expect(lineBreaks(c.text, em).length).toBe(1);
      expect([...c.text].length).toBeGreaterThanOrEqual(4);
    }
    expect(cards.map((c) => c.text).join('')).toBe(long);
  });
  it('英文子句切在詞界，不拆名字', () => {
    const en = 'The victim was on the floor beside his desk, with a blunt-force wound to the head.';
    const cards = splitCards(en, 30, 1);
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) expect(lineBreaks(c.text, 30).length).toBe(1);
  });
});

describe('每一行真的放得進框（關卡二 #3、#5）', () => {
  const m = (t: string) => t.length * 0.45;
  it('一行放不下就切張，不靠「尾巴併回去放寬」硬塞成一張', () => {
    const t = 'Overruled. There’s nothing wrong with that question, counsel.';
    const cards = splitCards(t, 25, 1, m);
    expect(cards.map((c) => c.text)).toEqual([
      'Overruled.',
      'There’s nothing wrong with that question, counsel.',
    ]);
  });
  it('兩行上限：長句切成幾張，每張都放得進兩行；硬換行的每一行不比框寬', () => {
    const t =
      'The witness is a physician, not an expert in this field, and has never testified about it before today, which the jury should keep in mind.';
    const cards = splitCards(t, 26, 2, m);
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) {
      expect(m(c.text)).toBeLessThanOrEqual(2 * 26.01);
      for (const l of c.lines ?? []) expect(m(l)).toBeLessThanOrEqual(26.01);
      expect((c.lines ?? []).length).toBeLessThanOrEqual(2);
    }
  });
});
