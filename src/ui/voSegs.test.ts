import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * 畫外字幕（VoiceOver）的中文只在作者標的「｜」之間換行（.vo-text .seg 不斷行）。
 * 沒標的長句在手機上整句排成一行，超出右緣被切掉（評測 v98：攤牌提示）。
 * 手機字幕 19–20px、字距 0.08em，390 寬放得下 16 字：每一段不超過 16 字。
 */
const MAX = 16;

function offLines(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const n of node) offLines(n, out);
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (o.voice === 'off') {
      const beats = (o.beats as { text: string }[] | undefined) ?? [];
      out.push(...(beats.length ? beats.map((b) => b.text) : [o.text as string]));
    }
    for (const v of Object.values(o)) offLines(v, out);
  }
  return out;
}

describe('畫外字幕的斷句', () => {
  for (const ep of ['ep1', 'ep2'])
    it(`${ep}：每一段（｜之間）不超過 ${MAX} 字`, () => {
      const doc = parse(readFileSync(new URL(`../content/${ep}.yaml`, import.meta.url), 'utf8'));
      const long = offLines(doc)
        .flatMap((t) => (t ?? '').split('｜'))
        .filter((seg) => [...seg.trim()].length > MAX);
      expect(long).toEqual([]);
    });
});
