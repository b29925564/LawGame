import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { curly, straight } from './curly';
import { install, reset, tIn } from '.';

describe('英文彎引號（顯示層）', () => {
  it('雙引號：開在行首或空白後，閉在字後', () => {
    expect(curly('"Objection," he said. "Sustained."')).toBe('“Objection,” he said. “Sustained.”');
    expect(curly('He said "yes" (and "no").')).toBe('He said “yes” (and “no”).');
    expect(curly('the "reminder"—always')).toBe('the “reminder”—always');
  });
  it('撇號與單引號', () => {
    expect(curly("It's Lucas's. Don't.")).toBe('It’s Lucas’s. Don’t.');
    expect(curly("He called it 'a trap'.")).toBe('He called it ‘a trap’.');
    expect(curly("the '90s")).toBe('the ’90s');
  });
  it('沒有引號就原樣，已經是彎的不動', () => {
    expect(curly('Plain text.')).toBe('Plain text.');
    expect(curly('“Already” curly’s')).toBe('“Already” curly’s');
  });
  it('straight 換回直引號（等寬字體用）', () => {
    expect(straight('“A” ‘b’ it’s')).toBe("\"A\" 'b' it's");
    const s = `He said "no" and it's done`;
    expect(straight(curly(s))).toBe(s);
  });
  it('整張英文表換完：雙引號成對、換回去和原文一樣', () => {
    const dir = new URL('../content/en/', import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
      for (const [k, v] of Object.entries(parse(readFileSync(new URL(f, dir), 'utf8')) ?? {})) {
        // 「」或「」是接在兩個名字中間的碎片，本身不成對；套進樣板之後才成對（Effects.tsx 先換回直引號）。
        if (k === '」或「') continue;
        const s = String(v);
        const c = curly(s);
        expect(straight(c), `${f} ${k}`).toBe(s);
        expect((c.match(/“/g) ?? []).length, `${f} ${k}`).toBe((c.match(/”/g) ?? []).length);
        expect(/["']/.test(c), `${f} ${k}`).toBe(false);
      }
    }
  });
  it('t / tIn 英文輸出是彎引號，中文不動', () => {
    reset();
    install({ 你好: `He said "hi", it's fine.`, '說：{x}': 'Said: "{x}"' });
    expect(tIn('en', '你好')).toBe('He said “hi”, it’s fine.');
    expect(tIn('en', '說：{x}', { x: 'ok' })).toBe('Said: “ok”');
    expect(tIn('zh', '你好')).toBe('你好');
    reset();
  });
});
