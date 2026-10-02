import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { install, reset, translate } from '../i18n';

const dir = new URL('../content/en/', import.meta.url);
const all: Record<string, string> = Object.assign(
  {},
  ...readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(new URL(f, dir), 'utf8')) ?? {}),
);

describe('英文對照表的樣板', () => {
  afterAll(reset);

  it('兩個佔位符不能相鄰：中間沒有固定字，任何字串都會被拆開', () => {
    const bad = Object.keys(all).filter((k) => /\}\{/.test(k));
    expect(bad).toEqual([]);
  });

  it('查不到的中文、已經是英文的字串都原樣回傳', () => {
    reset();
    install(all);
    for (const s of ['查無此句', '星期五下午', 'Let him talk.', 'Court system', 'Present'])
      expect(translate(s)).toBe(s);
  });
});
