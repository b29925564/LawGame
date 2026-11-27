import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 自架字型的子集（Issue #380 S3）只放遊戲用得到的字。劇本或介面多了子集沒有的字，畫面會退回系統字型：
 * 這裡擋下來，提示重跑 scripts/fonts.py。收字規則和 scripts/fonts.py 的 used_chars() 一樣。
 */
const ROOT = join(import.meta.dirname, '../../..');
const FONTS = join(ROOT, 'src/ui/fonts');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return p === FONTS ? [] : sources(p);
    return /\.(ts|tsx|yaml|json|css)$/.test(e.name) &&
      !e.name.includes('.test.') &&
      e.name !== 'test-setup.ts'
      ? [p]
      : [];
  });
}

const used = new Set<string>();
for (const f of [...sources(join(ROOT, 'src')), join(ROOT, 'index.html')])
  for (const c of readFileSync(f, 'utf8')) if (c.codePointAt(0)! >= 0x20) used.add(c);

const list = (name: string) => new Set(readFileSync(join(FONTS, name), 'utf8').trimEnd());
const primary = list('chars.txt');
const ext = list('ext.txt');

describe('自架字型的子集', () => {
  it('遊戲用到的中文字都在子集裡（不在就重跑 python3 scripts/fonts.py）', () => {
    const han = /\p{Script=Han}/u;
    const missing = [...used].filter((c) => han.test(c) && !primary.has(c) && !ext.has(c));
    expect(missing.join('')).toBe('');
  });

  it('用到的拉丁字母都在主檔字表裡（英文模式的字型只有主檔）', () => {
    const missing = [...used].filter((c) => /\p{Script=Latin}/u.test(c) && !primary.has(c));
    expect(missing.join('')).toBe('');
  });

  it('fonts.css 只引用資料夾裡的 woff2，每個字重都有主檔', () => {
    const css = readFileSync(join(FONTS, 'fonts.css'), 'utf8');
    const files = new Set(readdirSync(FONTS).filter((f) => f.endsWith('.woff2')));
    const refs = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(refs.filter((r) => !files.has(r))).toEqual([]);
    expect([...files].filter((f) => !refs.includes(f))).toEqual([]);
    const faces = [...css.matchAll(/@font-face \{([^}]+)\}/g)].map((m) => m[1]);
    for (const face of faces.filter((f) => f.includes('-ext.woff2')))
      expect(face, '補充檔只管表意文字與全形').toContain('unicode-range');
  });
});
