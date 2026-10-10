import { describe, expect, it } from 'vitest';
import { breakLines, cardTextLayout, firstSentence } from './pastel';

// 量字：拉丁字母 8px、其他（中文、全形標點）16px，夠用來檢查斷在哪裡。
const width = (s: string) => [...s].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 8 : 16), 0);

describe('陪審團速寫卡的斷行（設計師 P2-6 r2）', () => {
  it('英文只在空白斷，不在字中間斷', () => {
    const lines = breakLines(width, 'The defendant badged into the 31st floor at 22:47.', 120);
    expect(lines.join(' ')).toBe('The defendant badged into the 31st floor at 22:47.');
    for (const l of lines) expect(width(l)).toBeLessThanOrEqual(120);
    expect(lines.every((l) => !/^\S*$/.test(l) || l.length <= 15)).toBe(true);
    expect(lines).toContain('The defendant');
  });

  it('中文逐字斷，但標點不放在行首、開括號不放在行尾', () => {
    const s = '被告於週五 22:47 刷卡進入三十一樓（警方標註）。';
    for (const w of [64, 80, 96, 112, 128]) {
      const lines = breakLines(width, s, w);
      // 斷在空白的地方，空白不留在行頭行尾；其餘一字不少。
      expect(lines.join('').replace(/\s/g, '')).toBe(s.replace(/\s/g, ''));
      for (const l of lines.slice(1)) expect(l).not.toMatch(/^[，。、；：）」]/);
      for (const l of lines) expect(l).not.toMatch(/[（「]$/);
    }
  });

  it('中文以詞為單位：「刷卡」「31 樓」不拆，末行不只剩「門。」', () => {
    const s = '被告 22:47 刷卡進入 31 樓，23:01 刷卡離開大廳閘門。';
    for (const w of [96, 112, 128, 144]) {
      const lines = breakLines(width, s, w);
      const joined = lines.join('|');
      expect(joined).not.toMatch(/刷\|卡|31\|\s*樓|閘\|門/);
      expect(lines.at(-1)!.replace(/[^\p{Script=Han}]/gu, '').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('一個字比一行還寬，才在字中間斷', () => {
    expect(breakLines(width, 'police-annotated', 64)).toEqual(['police-a', 'nnotated']);
  });

  it('只抄第一句；卡要撐到放得下所有的字', () => {
    expect(firstSentence('沃斯在 21:55 傳訊息給瑞秋。23:31 又一則。')).toBe(
      '沃斯在 21:55 傳訊息給瑞秋。',
    );
    expect(firstSentence('Voss messages Rachel at 21:55. Another at 23:31.')).toBe(
      'Voss messages Rachel at 21:55.',
    );
    const L = cardTextLayout(
      (_f, x) => width(x),
      {
        w: 140,
        label: 'Chat system audit log',
        body: 'Voss messages Rachel at 21:55. Another at 23:31.',
        motif: 'lines',
      },
      { hand: 'serif', size: 16 },
    );
    expect(L.body.join(' ')).toBe('Voss messages Rachel at 21:55.');
    expect(L.need).toBe(9 + L.body.length * L.lh + 8 + L.label.length * (L.ls + 2) + 9);
  });
});
