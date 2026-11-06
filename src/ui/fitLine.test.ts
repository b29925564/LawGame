import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { fitLineUnits, glueTail } from './lineUnits';

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
    expect(glueTail('Pretrial hearing in three weeks')).toBe(`Pretrial hearing in three${NB}weeks`);
    expect(glueTail('Discovery deadline: two weeks')).toBe(`Discovery deadline: two${NB}weeks`);
    expect(glueTail('Mediation: one week')).toBe(`Mediation: one${NB}week`);
    expect(glueTail('Trial in 3 days now')).toBe(`Trial in 3${NB}days${NB}now`);
  });
  it('中文、單字不動', () => {
    expect(glueTail('開庭　三天後')).toBe('開庭　三天後');
    expect(glueTail('Trial')).toBe('Trial');
  });
});
