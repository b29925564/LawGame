import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { install, reset, translate } from '../i18n';
import { sentencesOf } from './court/subtitleSplit';
import {
  markedCards,
  markedFor,
  parseMarked,
  PLATE_BREAKS,
  plainOf,
  WEAK_USED,
} from './plateBreaks';
import { MIN_TAIL_WORDS, subCards } from './subCards';

/**
 * 底圖字幕的英文斷點（設計師 #296 第二版）：有底圖的英文句，只要在任何寬度或字級會斷成兩張以上，就要在 plateBreaks.ts 手標；
 * 沒標就紅。標了的句子在每一個寬度都照標的斷（不退回程式猜的），每張最多兩行、每一行都不比框寬，接續卡至少三個字。
 */
type Node = Record<string, unknown>;
type L = { who?: string; text: string; mark?: unknown; thought?: boolean; voice?: string };

const { plates } = JSON.parse(
  readFileSync(new URL('./plates/plates.json', import.meta.url), 'utf8'),
) as { plates: { scene: string }[] };
const scenes: Record<string, Node[]> = Object.fromEntries(
  ['ep1', 'ep2'].map((ep) => [
    ep,
    (
      parse(readFileSync(new URL(`../content/${ep}.yaml`, import.meta.url), 'utf8')) as {
        scenes: Node[];
      }
    ).scenes,
  ]),
);
const dir = new URL('../content/en/', import.meta.url);
const en: Record<string, string> = Object.assign(
  {},
  ...readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => parse(readFileSync(new URL(f, dir), 'utf8')) ?? {}),
);

/** 有底圖的場景裡進字幕卡的台詞（理論開場頁的台詞連記號行也是卡）。 */
function cardLines(scene: Node): L[] {
  const intro = (scene.intro as L[] | undefined) ?? [];
  const out: L[] = [...intro];
  for (const s of (scene.steps as Node[] | undefined) ?? []) {
    if (s.do === 'say') out.push(s as unknown as L);
    if (s.do === 'choose')
      for (const o of s.options as { text: string; then: L[] }[])
        out.push({ who: '盧卡斯', text: o.text }, ...o.then);
  }
  return out.filter(
    (l) => l.text && !l.thought && l.voice !== 'off' && (!l.mark || intro.includes(l)),
  );
}

// 桌機卡內寬 728px、20px 字；手機 412 寬卡內寬 346px、360 寬 296px、17px 字；字級乘 1／1.25／1.5。
const GEOMS = [
  { inner: 728, px: 20 },
  { inner: 346, px: 17 },
  { inner: 296, px: 17 },
];
const SCALES = [1, 1.25, 1.5];
// 英文平均字寬（em）：Plex Sans 500 在這幾句上實測 0.435–0.478；0.5 是偏寬的保守值，只用來找「可能會斷張」的句子。
const FACTORS = [0.44, 0.46, 0.48, 0.5];

/** 瀏覽器照空白貪婪折行（沒有硬換行的卡）。 */
function wrap(text: string, em: number, measure: (t: string) => number): string[] {
  const lines: string[] = [];
  for (const w of text.split(' ')) {
    const cur = lines[lines.length - 1];
    if (cur !== undefined && measure(`${cur} ${w}`) <= em) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  return lines;
}

const EN: string[] = [];
describe('底圖字幕的英文斷點', () => {
  reset();
  install(en);
  afterAll(reset);
  for (const key of new Set(plates.map((p) => p.scene))) {
    const [ep, id] = key.split(':');
    for (const l of cardLines(scenes[ep].find((s) => s.id === id) as Node))
      for (const s of sentencesOf(translate(l.text, id)).filter(Boolean)) EN.push(s);
  }
  const all = [...new Set(EN)];
  const emOf = (g: (typeof GEOMS)[number], k: number) =>
    Math.floor((g.inner / (g.px * k)) * 100 - 20) / 100;

  it('有英文句可以查', () => expect(all.length).toBeGreaterThan(10));

  for (const s of all)
    it(`${s.slice(0, 44)}…：會斷成多張就要有手標，而且照標的斷、不超過兩行、接續卡夠長`, () => {
      for (const g of GEOMS)
        for (const k of SCALES)
          for (const f of FACTORS) {
            const em = emOf(g, k);
            const measure = (t: string) => t.length * f;
            const cards = subCards(s, em, measure);
            const where = `${g.inner}px/${g.px * k}px/${f}`;
            for (const c of cards) {
              for (const ln of c.lines ?? [c.text])
                if (c.lines) expect(measure(ln), `${where} ${ln}`).toBeLessThanOrEqual(em + 0.01);
              const rows = c.lines ? c.lines.length : wrap(c.text, em, measure).length;
              expect(rows, `${where} ${c.text}`).toBeLessThanOrEqual(2);
            }
            if (cards.length > 1) {
              const m = markedFor(s);
              expect(
                m,
                `${where}：「${s}」會斷成 ${cards.length} 張，沒有在 plateBreaks.ts 標斷點`,
              ).toBeTruthy();
              // 偏寬的 0.5 只用來偵測；標的斷點在 0.44–0.46 照標的斷（真字型的實測在 e2e）。
              if (f <= 0.46)
                expect(
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  cards.map(({ of, marked, ...c }) => c),
                  where,
                ).toEqual(markedCards(m!, em, measure));
              cards
                .slice(1)
                .forEach((c) =>
                  expect(c.text.split(' ').length, `${where} ${c.text}`).toBeGreaterThanOrEqual(
                    MIN_TAIL_WORDS,
                  ),
                );
            }
          }
    });

  it('勉強換行點（~）只用在釘住的組合裡', () => {
    const used = new Set<string>();
    for (const b of PLATE_BREAKS) {
      const m = parseMarked(b);
      if (!m.kinds.includes('W')) continue;
      const noWeak = { ...m, kinds: m.kinds.map((k) => (k === 'W' ? '' : k)) } as typeof m;
      for (const g of GEOMS)
        for (const k of SCALES)
          for (const f of [0.44, 0.46]) {
            const em = emOf(g, k);
            const measure = (t: string) => t.length * f;
            const a = markedCards(m, em, measure);
            if (JSON.stringify(a) !== JSON.stringify(markedCards(noWeak, em, measure)))
              used.add(`${b.replace(/[|¦/]/g, ' ')} @${g.inner}px/${k * 100}%`);
          }
    }
    expect([...used].map((x) => x.replace(/ {2,}/g, ' ')).sort()).toEqual([...WEAK_USED].sort());
  });

  it('每一條標記對得到一句真的會斷張的台詞（不留過期的）', () => {
    for (const b of PLATE_BREAKS) {
      const plain = plainOf(parseMarked(b));
      expect(
        all.map((x) => x.replace(/[’‘]/g, "'")),
        b,
      ).toContain(plain);
      const splits = GEOMS.some((g) =>
        SCALES.some((k) => subCards(plain, emOf(g, k), (t) => t.length * 0.5).length > 1),
      );
      expect(splits, `${b} 在任何寬度都不會斷張，不必標`).toBe(true);
    }
  });

  it('標記的分張點、換行點都落在字之間，字串本身不帶記號', () => {
    for (const b of PLATE_BREAKS) {
      const m = parseMarked(b);
      expect(plainOf(m)).not.toMatch(/[|¦/~]/);
      expect(m.words.length).toBeGreaterThan(3);
    }
  });
});
