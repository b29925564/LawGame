import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { fitLineUnits } from './lineUnits';
import { englishLines, glueEnglish, glueTail } from './prose';

/** 兩集手機戲裡的黑底字卡（do: caption）正文。 */
const captions = Object.values(episodes).flatMap((ep) =>
  ep.scenes.flatMap((s) =>
    s.type === 'phone'
      ? s.steps.flatMap((st) => (st.do === 'caption' && !st.rig ? [st.text] : []))
      : [],
  ),
);

describe('黑底字卡的 fitLine 換行單位（設計師 v93 第二道關卡裁定 一之 2）', () => {
  it('第二道關卡點名的斷點都不會出現：沒｜登出、口｜袋、財務長｜辦公室、按了｜1', () => {
    const a = fitLineUnits(
      '週五深夜，卡爾德大樓 31 樓，財務長辦公室亮著燈。一台沒登出的電腦前，有人打了一行字。',
    );
    expect(a.some((u) => u.includes('沒登出'))).toBe(true);
    expect(a.some((u) => u.includes('財務長辦公室'))).toBe(true);
    const b = fitLineUnits('大廳閘門。他拿出手機，按了 9，按了 1，又把手機收回口袋。');
    expect(b.some((u) => u.includes('按了 1'))).toBe(true);
    expect(b.at(-1)).toContain('口袋。');
  });

  it('每一張卡：字一個不少；行尾不留虛詞；最後一個單位至少 3 個字', () => {
    expect(captions.length).toBeGreaterThan(5);
    for (const text of captions) {
      const u = fitLineUnits(text);
      expect(u.join(''), text).toBe(text);
      for (const x of u.slice(0, -1))
        if (!/[\p{P}\s]$/u.test(x)) expect(x, `${text}：「${x}」`).not.toMatch(/[的了把在沒又他]$/);
      expect(
        [...u.at(-1)!].filter((c) => /[\p{L}\p{N}]/u.test(c)).length,
        text,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('沒有漢字的英文原樣不動', () => {
    expect(fitLineUnits('The lobby gate.')).toEqual(['The lobby gate.']);
  });
});

describe('glueTail：英文頂列期限的黏字（設計師裁定 25376da）', () => {
  const NB = ' ';
  it('數字和單位黏住，最後兩個字黏住', () => {
    expect(glueTail('Pretrial hearing in three weeks')).toBe(
      `Pretrial hearing in${NB}three${NB}weeks`,
    );
    expect(glueTail('Trial in three days')).toBe(`Trial in${NB}three${NB}days`);
    expect(glueTail('Discovery deadline: two weeks')).toBe(`Discovery${NB}deadline: two${NB}weeks`);
    expect(glueTail('Mediation: one week')).toBe(`Mediation: one${NB}week`);
    expect(glueTail('Trial in 3 days now')).toBe(`Trial in${NB}3${NB}days${NB}now`);
  });
  it('中文、單字不動', () => {
    expect(glueTail('開庭　三天後')).toBe('開庭　三天後');
    expect(glueTail('Trial')).toBe('Trial');
  });
});

describe('glueEnglish：英文黑底字卡的黏字（設計師 #326 審查）', () => {
  const NB = ' ';
  it('虛詞黏下一個字、專有名詞不拆、最後兩個字黏住', () => {
    expect(glueEnglish('A white van waits at a red light, a phone clipped to the dashboard.')).toBe(
      `A${NB}white van waits at${NB}a${NB}red light, a${NB}phone clipped to${NB}the${NB}dashboard.`,
    );
    expect(glueEnglish('Friday, late. Calder Building, 31st floor.')).toBe(
      `Friday, late. Calder${NB}Building, 31st${NB}floor.`,
    );
  });
});

describe('englishLines：英文黑底字卡自己排行（設計師 #326 審查）', () => {
  // 一個字母一個單位寬，好算。
  const lay = (text: string, room: number) => {
    const parts = text.split(/([ \u00a0])/);
    const words = parts.filter((_, i) => i % 2 === 0);
    const hard = parts.filter((_, i) => i % 2 === 1).map((x) => x === '\u00a0');
    return englishLines(words, hard, (s) => s.length, room).map((l) => l.replace(/\u00a0/g, ' '));
  };
  it('行尾不留虛詞、沒有單字行、地名不拆', () => {
    expect(lay('Tuesday evening, east\u00a0Calder\u00a0Harbor. A white van waits.', 20)).toEqual([
      'Tuesday evening,',
      'east Calder Harbor.',
      'A white van waits.',
    ]);
    expect(lay('a phone clipped to the dashboard.', 18)).toEqual([
      'a phone clipped',
      'to the dashboard.',
    ]);
  });
  it('放不下時：先保地名的大寫部分，再保行尾，單字行最先讓', () => {
    expect(lay('Tuesday evening, east\u00a0Calder\u00a0Harbor.', 16)).toEqual([
      'Tuesday',
      'evening, east',
      'Calder Harbor.',
    ]);
  });
});
