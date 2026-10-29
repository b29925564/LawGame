import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { nameUnits } from './lineUnits';

/** 兩集所有證據卡的中文卡名（牌架排字的輸入）。 */
function cardNames(): string[] {
  const names = new Set<string>();
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>;
      if (typeof r.name === 'string' && typeof r.kind === 'string' && typeof r.id === 'string')
        names.add(r.name);
      Object.values(r).forEach(walk);
    }
  };
  walk(episodes);
  return [...names];
}

describe('牌架中文卡名的斷行單位（第二道關卡 v93 第 2 處）', () => {
  it('字一個不少，單位的字串接回去就是卡名', () => {
    for (const n of cardNames())
      expect(
        nameUnits(n)
          .map((u) => u.w + u.p)
          .join(''),
      ).toBe(n);
  });

  it('複合詞不在中間斷開：派單、規格書、變更單、領過、說法', () => {
    const w = (n: string) => nameUnits(n).map((u) => u.w + u.p);
    expect(w('App 日誌：死後仍在派單')).toContain('派單');
    expect(w('舊版規格書：疲勞鎖')).toContain('規格書：');
    expect(w('設定變更單：改為提醒')).toContain('變更單：');
    expect(w('藥局紀錄：只領過一次藥')).toContain('只領過');
    expect(w('起訴狀')).toEqual(['起訴狀']);
    expect(w('叫車收據')).toContain('叫車');
    expect(w('費雪醫師報告')).toContain('費雪');
    // 虛詞還是可以斷（「蘇菲｜對｜警方的」）。
    expect(w('蘇菲對警方的說法：我直接回家了')).toContain('對');
  });

  it('兩集所有卡名：沒有單獨一個字的非虛詞單位', () => {
    const FUNC = /^[的之與和及是在被他她它我你對都也就把給]$/;
    for (const n of cardNames()) {
      const us = nameUnits(n);
      if (us.length < 2) continue;
      for (const u of us) {
        const single = [...u.w].length === 1 && /\p{Script=Han}/u.test(u.w);
        expect(single && !FUNC.test(u.w), `${n} 裡的「${u.w}${u.p}」`).toBe(false);
      }
    }
  });
});
