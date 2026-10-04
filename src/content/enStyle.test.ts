import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/** 英文對照表的機械檢查：錯字、標點這類一改就容易回頭的東西。 */
const dir = new URL('./en/', import.meta.url);
const rows: [string, string, string][] = readdirSync(dir)
  .filter((f) => f.endsWith('.yaml'))
  .flatMap((f) =>
    Object.entries(parse(readFileSync(new URL(f, dir), 'utf8')) ?? {}).map(
      ([k, v]) => [f, k, String(v)] as [string, string, string],
    ),
  );

const offending = (test: (v: string) => boolean) =>
  rows.filter(([, , v]) => test(v)).map(([f, k, v]) => `${f} ${k} → ${v}`);

describe('英文字串的標點與拼字', () => {
  it('引號一律用直引號，不混用彎引號', () => {
    expect(offending((v) => /[‘’“”]/.test(v))).toEqual([]);
  });

  it('美式標點：句號、逗號放在雙引號裡面', () => {
    expect(offending((v) => /"[^"]*"[.,]/.test(v))).toEqual([]);
  });

  it('主角姓 Grey，不拼成 Gray', () => {
    expect(offending((v) => /\bGray\b/.test(v))).toEqual([]);
  });

  it('沒有連打兩次的字', () => {
    expect(offending((v) => /\b(\w+) \1\b/i.test(v))).toEqual([]);
  });

  it('英文裡不夾全形標點或中文字（｜是劇本的分行記號，除外）', () => {
    // 全形標點 U+3000–303F、全形字 U+FF00–FFEF、漢字 U+4E00–9FFF。
    const cjk = (c: string) => {
      const n = c.codePointAt(0) ?? 0;
      return (
        (n >= 0x3000 && n <= 0x303f) || (n >= 0xff00 && n <= 0xffef) || (n >= 0x4e00 && n <= 0x9fff)
      );
    };
    expect(offending((v) => [...v.replace(/｜/g, '')].some(cjk))).toEqual([]);
  });
});
