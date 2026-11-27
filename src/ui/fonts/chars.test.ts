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
  // 補充檔是保險，不是正常路徑：它要等畫面出現那個字才載，那一行先用備用字型、再換字重排，
  // fitLine 量好的換行就跑掉（設計師 #462 審查）。所以現有的字都要在主檔，只在補充檔也算失敗。
  it('遊戲用到的中文字都在主檔裡（不在就重跑 python3 scripts/fonts.py）', () => {
    const han = /\p{Script=Han}/u;
    const missing = [...used].filter((c) => han.test(c) && !primary.has(c));
    expect(missing.join('')).toBe('');
  });

  it('用到的拉丁字母都在主檔字表裡（英文模式的字型只有主檔）', () => {
    const missing = [...used].filter((c) => /\p{Script=Latin}/u.test(c) && !primary.has(c));
    expect(missing.join('')).toBe('');
  });

  it('英文模式的拉丁字母在 Plex 與 Source Serif 的切片範圍裡（Google 原檔只搬 latin、latin-ext）', () => {
    const css = readFileSync(join(FONTS, 'fonts.css'), 'utf8');
    for (const family of ['IBM Plex Sans', 'Source Serif 4']) {
      const spans = [...css.matchAll(/@font-face \{([^}]+)\}/g)]
        .map((m) => m[1])
        .filter((f) => f.includes(`'${family}'`) && f.includes('font-style: normal'))
        .flatMap((f) => /unicode-range: ([^;]+);/.exec(f)![1].split(','))
        .map((r) =>
          r
            .trim()
            .slice(2)
            .split('-')
            .map((h) => parseInt(h, 16)),
        )
        .map(([a, b = a]) => [a, b]);
      const missing = [...used].filter(
        (c) =>
          /\p{Script=Latin}/u.test(c) &&
          !spans.some(([a, b]) => c.codePointAt(0)! >= a && c.codePointAt(0)! <= b),
      );
      expect(missing.join(''), family).toBe('');
    }
  });

  it('主檔與補充檔不重疊（同一個字只在一份裡）', () => {
    expect([...ext].filter((c) => primary.has(c)).join('')).toBe('');
  });

  it('fonts.css 只引用資料夾裡的 woff2，每個字重都有主檔', () => {
    const css = readFileSync(join(FONTS, 'fonts.css'), 'utf8');
    const files = new Set(readdirSync(FONTS).filter((f) => f.endsWith('.woff2')));
    const refs = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((m) => m[1]);
    expect(refs.filter((r) => !files.has(r))).toEqual([]);
    expect([...files].filter((f) => !refs.includes(f))).toEqual([]);
    const faces = [...css.matchAll(/@font-face \{([^}]+)\}/g)].map((m) => m[1]);
    // 同一字族後宣告的先查：補充檔、主檔、首屏。首屏與補充檔要有 unicode-range，主檔沒有（其餘的字都落到它）。
    for (const face of faces.filter((f) => /-(ext|first)\.woff2/.test(f)))
      expect(face).toContain('unicode-range');
    // 拉丁字型是 Google 原檔的切片，unicode-range 照抄；中文主檔沒有範圍。
    for (const face of faces.filter((f) => !/-(ext|first|latin(-ext)?)\.woff2/.test(f)))
      expect(face).not.toContain('unicode-range');
    const order = refs.filter((r) => r.startsWith('noto-sans-tc-400'));
    expect(order).toEqual([
      'noto-sans-tc-400-ext.woff2',
      'noto-sans-tc-400.woff2',
      'noto-sans-tc-400-first.woff2',
    ]);
  });
});
