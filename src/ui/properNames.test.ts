import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fitLineUnits, PROPER_ZH, proseUnits } from './lineUnits';
import { EN_NAMES } from './enNames';
import { fitLineEn, glueEnglish, glueTail } from './prose';

/** 內容檔裡的每一段字（ep1／ep2 的值、en/*.yaml 的中文鍵與英文值）。 */
const lines = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n'))
    .flatMap((l) => l.replace(/^[\s-]*/, '').split(/: (?=\S)/))
    .map((x) => x.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);

/** 切點（每個單位的結尾位置）有沒有落在 [a, b) 中間。 */
const cutsInside = (units: string[], a: number, b: number) => {
  let at = 0;
  return units.some((u) => (at += u.length) > a && at < b);
};

describe('專有名詞不拆（設計師裁定 a26de2b）', () => {
  it('中文：內容裡出現的每個地名、公司、機構，在 fitLine 和紙面內文都整個不拆', () => {
    const all = [...lines('src/content'), ...lines('src/content/en')];
    const bad: string[] = [];
    let seen = 0;
    for (const s of all)
      for (const k of PROPER_ZH)
        for (let a = s.indexOf(k); a >= 0; a = s.indexOf(k, a + 1)) {
          seen++;
          for (const units of [fitLineUnits(s), proseUnits(s)])
            if (cutsInside(units, a, a + k.length)) bad.push(`${k}：${units.join('｜')}`);
        }
    expect(seen).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });

  it('中文：內容裡「卡爾德○○」都在表上（新加的地名要補進 PROPER_ZH）', () => {
    const all = lines('src/content').join('\n');
    const found = new Set(
      [
        ...all.matchAll(
          /卡爾德(?:郡|州|港)?(?:[\p{Script=Han}]{0,4}?)(?:大樓|物流|快遞|看守所|警局|法院|法醫室|論壇報|東區)/gu,
        ),
      ].map((m) => m[0]),
    );
    for (const k of found)
      expect(
        PROPER_ZH.some((p) => p.includes(k) || k.includes(p)),
        k,
      ).toBe(true);
  });

  it('英文：Calder County／Building／Harbor 等專有名詞在每一種顯示都黏住', () => {
    const NB = ' ';
    for (const n of EN_NAMES) {
      const s = `We met at ${n} on Monday afternoon after the hearing`;
      const glued = n.replace(/ /g, NB);
      expect(fitLineEn(s), n).toContain(glued);
      expect(glueEnglish(s), n).toContain(glued);
      expect(glueTail(s), n).toContain(glued);
    }
    // 內容裡至少都出現過一次（表上的是真的在用的名字）。
    const en = lines('src/content/en').join('\n');
    for (const n of EN_NAMES) expect(en, n).toContain(n);
  });
});
