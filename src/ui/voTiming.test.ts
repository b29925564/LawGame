import { describe, expect, it } from 'vitest';
import { voTiming } from './voTiming';

describe('畫外字幕的節奏', () => {
  it('標點後停頓，｜不算字', () => {
    const t = voTiming('我沒有贏。｜我');
    expect(t.starts).toEqual([0, 50, 100, 150, 200, 570]);
    expect(t.type).toBe(620);
  });
  it('整段出字不超過 2400ms，停留時間有上下限', () => {
    const long = voTiming('認罪書上寫的是他做過的事。｜我到現在都不知道，那是不是真的。');
    expect(long.type).toBeLessThanOrEqual(2400);
    expect(long.starts.at(-1)!).toBeLessThan(2400);
    expect(voTiming('碼頭九號。').hold).toBe(1800);
    expect(voTiming('字'.repeat(60)).hold).toBe(7000);
  });
});
