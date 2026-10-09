import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { episodeSchema } from '../engine/episode/schema';
import { caseSchema } from '../engine/schema';

/**
 * Zod 的物件預設會把 schema 沒寫的欄位直接丟掉，不報錯。劇本寫了、引擎卻沒收到的欄位
 * （例如聲請反轉選項的 ethics，2026-10-09 才發現從來沒記進倫理帳本）都在這裡擋下。
 * 新欄位請先加進 schema；頂層以 _ 開頭的是 YAML 錨點（_cards），不算。
 */
function dropped(raw: unknown, out: unknown, path: string, acc: string[]) {
  if (Array.isArray(raw)) {
    if (Array.isArray(out)) raw.forEach((x, i) => dropped(x, out[i], `${path}[${i}]`, acc));
  } else if (raw && typeof raw === 'object' && out && typeof out === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (!path && k.startsWith('_')) continue;
      if (!(k in out)) acc.push(`${path}.${k}`);
      else dropped(v, (out as Record<string, unknown>)[k], `${path}.${k}`, acc);
    }
  }
}

const files = [
  ['ep1.yaml', episodeSchema],
  ['ep2.yaml', episodeSchema],
  ['proto.yaml', caseSchema],
] as const;

describe('劇本的每個欄位都有進 schema，沒有被默默丟掉', () => {
  for (const [file, schema] of files)
    it(file, () => {
      const raw = parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
      const acc: string[] = [];
      dropped(raw, schema.parse(raw), '', acc);
      expect(acc).toEqual([]);
    });

  it('真的抓得到：schema 沒寫的欄位會被列出來', () => {
    const acc: string[] = [];
    dropped({ a: [{ b: 1, typo: 2 }] }, { a: [{ b: 1 }] }, '', acc);
    expect(acc).toEqual(['.a[0].typo']);
  });
});
