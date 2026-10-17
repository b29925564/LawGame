import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { install, reset, translate } from '../i18n';
import { lineBreaks, sentences } from './court/subtitleSplit';
import { subCards } from './subCards';

/**
 * 底圖上的字幕（設計師 #296）：一張卡一個句子，任何字級（100／125／150%）、桌機和手機的卡寬都不超過兩行。
 * 規則在這裡擋住，不靠有人逐場去看。e2e（scene-plate.spec.ts）再用真的瀏覽器量一次。
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

/** 有底圖的場景裡會進字幕卡的台詞：選項的回應也算（玩家選了之後會看到）。 */
function lines(scene: Node): L[] {
  const out: L[] = [...((scene.intro as L[] | undefined) ?? [])];
  for (const s of (scene.steps as Node[] | undefined) ?? []) {
    if (s.do === 'say') out.push(s as unknown as L);
    if (s.do === 'choose')
      for (const o of s.options as { text: string; then: L[] }[]) {
        out.push({ who: '盧卡斯', text: o.text }, ...o.then);
      }
  }
  return out.filter((l) => l.text && !l.mark && !l.thought && l.voice !== 'off');
}

const oneWord = (x: string) =>
  /\p{Script=Han}/u.test(x)
    ? [...x.replace(/[\s。！？.!?」』"”’)）…—]/gu, '')].length < 3
    : x.split(/\s+/).length < 2;

// 桌機卡內寬 728px、20px 字；手機最窄 360px 的卡內寬 296px、17px 字（字級乘設定的 1／1.25／1.5）。
const WIDTHS = [
  { name: '桌機', inner: 728, px: 20 },
  { name: '手機', inner: 296, px: 17 },
];
const SCALES = [1, 1.25, 1.5];

describe('字幕卡（有底圖的場景）', () => {
  afterAll(reset);
  reset();
  install(en);

  const keys = [...new Set(plates.map((p) => p.scene))];
  for (const key of keys) {
    const [ep, id] = key.split(':');
    const scene = scenes[ep].find((s) => s.id === id) as Node;
    for (const lang of ['zh', 'en'] as const) {
      for (const w of WIDTHS)
        for (const k of SCALES) {
          it(`${key}・${lang}・${w.name} ${k * 100}%：一句一張、不超過兩行、拼回原文`, () => {
            const em = Math.floor((w.inner / (w.px * k)) * (lang === 'zh' ? 0.95 : 1));
            for (const l of lines(scene)) {
              const text = lang === 'zh' ? l.text : translate(l.text, id);
              const cards = subCards(text, em);
              expect(cards.length).toBeGreaterThan(0);
              expect(cards.map((c) => c.text).join(lang === 'zh' ? '' : ' ')).toBe(text);
              for (const c of cards) {
                expect(lineBreaks(c.text, em).length, c.text).toBeLessThanOrEqual(2);
                // 一張只放一個句子；例外只有「一個字的句子」併進旁邊那句。
                const inCard = sentences(c.text).filter(Boolean);
                expect(inCard.filter((x) => !oneWord(x)).length, c.text).toBeLessThanOrEqual(1);
              }
            }
          });
        }
    }
  }

  it('英文每一行都不比框寬（切分器收尾的放寬不能漏到字幕框）', () => {
    // 用每字 0.5em 的假字型量；框寬 16em：「courtroom leads to the holding cells.」放不下一行。
    const measure = (t: string) => t.length * 0.5;
    const s = 'The side door of the sentencing courtroom leads to the holding cells.';
    const cards = subCards(s, 16, measure);
    expect(cards.map((c) => c.text).join(' ')).toBe(s);
    for (const c of cards) {
      for (const l of c.lines ?? [c.text]) expect(measure(l), l).toBeLessThanOrEqual(16);
      expect(c.text.split(' ').length, c.text).toBeGreaterThan(1);
    }
  });

  it('旁白兩句拆成兩張（量刑庭的側門）', () => {
    const cards = subCards('量刑庭的側門通往羈押室。法警在門口停了一下，讓伊森回頭。', 34);
    expect(cards.map((c) => c.text)).toEqual([
      '量刑庭的側門通往羈押室。',
      '法警在門口停了一下，讓伊森回頭。',
    ]);
    const e = subCards(
      'The side door of the sentencing courtroom leads to the holding room. The bailiff paused in the doorway so Ethan could look back.',
      34,
    );
    expect(e.length).toBe(2);
  });

  it('一個字的句子不單獨一張', () => {
    expect(subCards('是。我沒有看到他走進去。', 34).map((c) => c.text)).toEqual([
      '是。我沒有看到他走進去。',
    ]);
    expect(subCards('No. I never saw him go in.', 34).length).toBe(1);
  });

  it('長句不截斷：在逗號切子句，再放不下才在詞界斷', () => {
    const s =
      '當晚十點四十七分我在三十一樓的影印室，聽見隔壁傳來重物倒地的聲音，但是我以為只是有人在搬東西，所以沒有出去看。';
    const cards = subCards(s, 12);
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.map((c) => c.text).join('')).toBe(s);
    for (const c of cards) expect(lineBreaks(c.text, 12).length).toBeLessThanOrEqual(2);
  });
});
