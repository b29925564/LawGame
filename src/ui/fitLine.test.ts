import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { fitLineUnits } from './lineUnits';
import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chineseLines, englishLines, fitLine, fitLineEn, glueEnglish, glueTail } from './prose';

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

  it('每一張卡：字一個不少；行尾不留介詞連詞否定詞、行首不是的了著過；最後一個單位至少 3 個字', () => {
    expect(captions.length).toBeGreaterThan(5);
    for (const text of captions) {
      const u = fitLineUnits(text);
      expect(u.join(''), text).toBe(text);
      for (const x of u.slice(0, -1))
        if (!/[\p{P}\s]$/u.test(x))
          expect(x, `${text}：「${x}」`).not.toMatch(/[把在被跟和與對從向沒又]$/);
      // 「的了著過地得」往前黏：可以在行尾，不在行首（設計師 #329 @7fde9ba 第 1 項）。
      const seg = new Intl.Segmenter('zh-Hant', { granularity: 'word' });
      for (const x of u.slice(1))
        expect([...seg.segment(x)][0].segment, `${text}：「${x}」`).not.toMatch(/^[的了著過地得]$/);
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

describe('第二道關卡 72a9003 設計師裁定 1、6', () => {
  const NB = '\u00a0';
  it('房號、庭號跟著前面的名詞；最後兩個字黏住', () => {
    expect(fitLineEn('Whitlock & Hale, Conference Room A, Monday 15:00')).toContain(
      `Conference${NB}Room${NB}A,`,
    );
    expect(fitLineEn('Whitlock & Hale, Conference Room A, Monday 15:00')).toContain(
      `Hale, Conference`,
    );
    expect(fitLineEn('Calder County Superior Court, Courtroom 5')).toContain(`Courtroom${NB}5`);
    expect(fitLineEn('Dad. In 2016, who ordered the maintenance records destroyed?')).toMatch(
      new RegExp(`records${NB}destroyed\\?$`),
    );
  });
  it('最後兩個字黏成一段時，裡面的專有名詞還是一塊（頂列「Assistant District ⏎ Attorney」）', () => {
    const html = (t: string) => renderToStaticMarkup(createElement(Fragment, null, fitLine(t)));
    expect(html('Catherine Morrow · Assistant District Attorney')).toContain(
      '<span class="fl">District Attorney</span>',
    );
    expect(html('Trevor Mills · VP of Operations, Calder Express')).toContain(
      '<span class="fl">Calder Express</span>',
    );
  });
  it('數詞＋量詞跟後面的詞同一個單位', () => {
    const u = fitLineUnits('財務長辦公室亮著燈。一台沒登出的電腦前，有人打了一行字。');
    expect(u.some((x) => /一台$/.test(x))).toBe(false);
    expect(u.some((x) => /一行$/.test(x))).toBe(false);
    expect(fitLineUnits('一台白色廂型車停在紅燈前')).toContain('一台白色廂型車');
  });
  it('中文字卡：行數最少，同樣行數先斷在句號後；每行至少 3 個字', () => {
    // 每個字 1 寬、標點也是 1：一行 10 個字。
    const width = (x: string) => [...x.trimEnd()].length;
    expect(chineseLines('公車進站，又開走了。伊森沒有上車。', width, 10)).toEqual([
      '公車進站，又開走了。',
      '伊森沒有上車。',
    ]);
    for (const l of chineseLines(
      '週二傍晚，卡爾德港東區。一台白色廂型車停在紅燈前，儀表板上夾著一支手機。',
      width,
      7,
    ))
      expect(l.match(/[\p{L}\p{N}]/gu)!.length, l).toBeGreaterThanOrEqual(3);
  });
});

describe('第二道關卡 464a280 第 5 項：短標籤', () => {
  const lines = (text: string, room: number) => {
    const parts = text.split(/([  ])/);
    const words = parts.filter((_, i) => i % 2 === 0);
    const hard = parts.filter((_, i) => i % 2 === 1).map((x) => x === ' ');
    return englishLines(words, hard, (s) => s.length, room).map((l) => l.replace(/ /g, ' '));
  };
  it('英文兩個字的標籤也黏住（"Not ⏎ agreed"、"$1.5 ⏎ million" 不行）', () => {
    for (const t of ['Not agreed', '$1.5 million']) expect(fitLineEn(t)).toBe(t.replace(' ', ' '));
  });
  it('單字行不得不出現時，放在中間，不放最後一行（"currently taking ⏎ torts."）', () => {
    expect(lines('Twenty-three, currently taking torts.', 16)).toEqual([
      'Twenty-three,',
      'currently',
      'taking torts.',
    ]);
  });
  it('房名和房號不拆（「調解｜室 2」「調解｜室外的走廊」）', () => {
    expect(fitLineUnits('第四幕・卡爾德郡高等法院　調解室 2　週四 10:00')).toContain('調解室 2');
    expect(
      fitLineUnits('卡爾德郡高等法院　調解室外的走廊').some((u) => u.startsWith('調解室')),
    ).toBe(true);
  });
});
