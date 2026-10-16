import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { episodes } from '../../content';
import { STRUCK_DEFAULT } from '../../engine/episode/trial';
import { install, translate } from '../../i18n';
import { proseUnits } from '../lineUnits';
import { CUT_EXCEPTIONS, judgeCards, subEm } from './subtitleSplit';

/**
 * 法官的話在鏡頭條上的樣子（設計師 #290 第二輪）：一張是一個完整的句子，最多兩行，
 * 同一句在每個寬度都切成一樣的張數，不能只剩一個字、斷在片語中間。
 * 鏡頭條各寬度的字幕列寬與字級是在真實頁面量的（桌機 1100–1530、Pixel 7 手機）。
 */
const GEOMS: { name: string; w: number; px: number }[] = [
  { name: '1100', w: 372, px: 19 },
  { name: '1180', w: 396, px: 19 },
  { name: '1366', w: 446, px: 19 },
  { name: '1440', w: 520, px: 19 },
  { name: '1530', w: 560, px: 19 },
  { name: '手機', w: 396, px: 17 },
];
const cardsAt = (text: string, g: (typeof GEOMS)[number]) =>
  judgeCards(
    text,
    /\p{Script=Han}/u.test(text)
      ? subEm(g.w, g.px)
      : Math.floor((Math.min(g.w - 32, 36 * g.px) - 24) / g.px),
    null,
    est,
  );

/** 設定裡字幕放大 150%：字級 ×1.5，一行放得下的字數少三分之一（同一組字幕列寬）。 */
const at150 = (g: (typeof GEOMS)[number]) => ({ ...g, px: g.px * 1.5 });

/** 英文行寬：Plex Sans 500 實測平均約 0.46em（真字型的實測在 e2e）。 */
const est = (t: string) => t.length * 0.46;

const trials = Object.values(episodes).flatMap((ep) => ep.scenes.filter((s) => s.type === 'trial'));

/** 劇本裡法官會說的每一句：成立裁定、預設台詞、引擎寫死的訓斥。 */
function judgeLines(): { scene: string; zh: string }[] {
  const out: { scene: string; zh: string }[] = [];
  const walk = (scene: string, v: unknown) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(scene, x));
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.sustained === 'string') out.push({ scene, zh: o.sustained });
    if (o.who === '法官' && typeof o.text === 'string') out.push({ scene, zh: o.text });
    Object.values(o).forEach((x) => walk(scene, x));
  };
  for (const s of trials) {
    walk(s.id, s);
    out.push({ scene: s.id, zh: `辯方可以詰問${s.witness.name}。` });
  }
  for (const zh of [
    '異議成立。陪審團請不要理會這個問題。',
    '異議駁回。律師，這個問題沒有問題。',
    '異議成立。律師，先建立基礎。',
    '律師，我警告過你了。詰問到此為止，本庭不容許這樣浪費陪審團的時間。',
    '律師，證人還沒有就這一點作證。',
    STRUCK_DEFAULT,
  ])
    out.push({ scene: '', zh });
  return out;
}

beforeAll(() => {
  const dir = new URL('../../content/en/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml')))
    install(parse(readFileSync(new URL(f, dir), 'utf8')) ?? {});
});

/**
 * 這幾句在 1100／1180 寬放不進兩行（字級 100%，整句要 33 個 em 以上，一行只放得下 16 個 em），只能在子句邊界切，
 * 張數比寬的鏡頭條多；設計師說「連兩行都放不下整句就先回報」（#290 第二輪），回報後再決定。
 */
const TOO_LONG_AT_1100 = [
  // 這句在估算寬度（0.46em／字）下差幾個字放不進兩行；真字型的實測在 e2e 與 qa 紀錄。
  "The witness's opinion of the defendant is character evidence",
  'The court has excluded that statement and the prosecution may not raise it',
  'the testimony of Ms. Adler is stricken in its entirety',
  'The witness has no way of knowing what the defendants’ executives have read',
  "The witness has no way of knowing what the defendants' executives have read",
];

describe('法官的台詞：一句一張、最多兩行、張數不隨寬度變', () => {
  const lines = judgeLines().filter((l) => l.zh);
  it('放不進兩行的整句只出現在 1100／1180，其他寬度與手機都放得進', () => {
    for (const text of TOO_LONG_AT_1100.flatMap((x) => texts('en').filter((t) => t.includes(x))))
      for (const g of GEOMS.filter((x) => x.w > 396 || x.name === '手機'))
        expect(cardsAt(text, g).length, `${g.name}：${text}`).toBe(piecesCount(text));
  });
  it('找得到法官的台詞', () => {
    expect(lines.length).toBeGreaterThan(10);
  });
  const texts = (lang: 'zh' | 'en') =>
    lines
      .map(({ scene, zh }) => (lang === 'en' ? translate(zh, scene) : zh))
      .filter((t) => t && (lang === 'zh' || /[a-z]/i.test(t)));
  for (const lang of ['zh', 'en'] as const) {
    it(`${lang}：每一句在每個寬度切成一樣的張數（兩行放不下整句的除外，見下）`, () => {
      const bad: string[] = [];
      for (const text of texts(lang)) {
        if (TOO_LONG_AT_1100.some((x) => text.includes(x))) continue;
        const n = GEOMS.map((g) => cardsAt(text, g).length);
        if (new Set(n).size > 1)
          bad.push(`${text} → ${GEOMS.map((g, i) => `${g.name}:${n[i]}`).join(' ')}`);
      }
      expect(bad).toEqual([]);
    });
    it(`${lang}：沒有只剩一個字的張（完整的一句除外），每張最多兩行`, () => {
      const bad: string[] = [];
      for (const text of texts(lang))
        for (const g of GEOMS)
          for (const c of cardsAt(text, g)) {
            const complete = /[。！？.!?」”’)）]$/.test(c.text);
            const words = lang === 'en' ? c.text.split(/\s+/).length : c.text.length;
            if (!complete && words < (lang === 'en' ? 2 : 4))
              bad.push(`${g.name} 太碎：「${c.text}」`);
            if ((c.lines?.length ?? 1) > 2) bad.push(`${g.name} 超過兩行：${c.text}`);
          }
      expect(bad).toEqual([]);
    });
  }
  // 設計師 #290 第三輪：150% 不出三行、不出單字卡；一句放不下就在片語邊界切成兩張；中文不在詞中間斷。
  for (const lang of ['zh', 'en'] as const)
    it(`${lang}：字幕 150% 每張最多兩行、沒有單字卡、中文不斷在詞中間`, () => {
      const bad: string[] = [];
      for (const text of texts(lang))
        for (const g of GEOMS.map(at150)) {
          const em =
            lang === 'zh'
              ? subEm(g.w, g.px)
              : Math.floor((Math.min(g.w - 32, 36 * g.px) - 24) / g.px);
          for (const c of judgeCards(text, em, null, est)) {
            const rows = c.lines ?? [c.text];
            if (rows.length > 2) bad.push(`${g.name} 三行：${c.text}`);
            const complete = /[。！？.!?」”’)）]$/.test(c.text);
            const n = lang === 'en' ? c.text.split(/\s+/).length : c.text.length;
            // 完整的一句（「Sustained.」）不算單字卡；沒收尾的零碎（「Counsel,」）才算。
            if (!complete && n < (lang === 'en' ? 2 : 3))
              bad.push(`${g.name} 單字卡：「${c.text}」`);
            if (lang === 'zh' && rows.length > 1) {
              const marks = new Set<number>();
              let pos = 0;
              for (const u of proseUnits(c.text, false)) marks.add((pos += u.length));
              let cut = 0;
              for (const l of rows.slice(0, -1)) {
                cut += l.length;
                if (!marks.has(cut)) bad.push(`${g.name} 斷在詞中間：${rows.join('／')}`);
              }
            }
          }
        }
      expect(bad).toEqual([]);
    });
  // 設計師 #290 第三輪：動詞和受詞不分開，優先切在介系詞片語前面。
  it('150%：「Counsel, don’t put the answer／in the question.」不把動詞和受詞拆開', () => {
    for (const g of [GEOMS[0], GEOMS[1]].map(at150)) {
      const em = Math.floor((Math.min(g.w - 32, 36 * g.px) - 24) / g.px);
      const t = judgeCards('Counsel, don’t put the answer in the question.', em, null, est).map(
        (c) => c.text,
      );
      expect(t, g.name).toEqual(['Counsel, don’t put the answer', 'in the question.']);
    }
  });
  it('詞界規則的例外清單只有一句（清單每多一句都要再給設計師看）', () => {
    expect(CUT_EXCEPTIONS).toEqual(['with that question, counsel.']);
  });
  it('一句放得進兩行就是一張：張數等於句子數', () => {
    const bad: string[] = [];
    for (const text of texts('en').concat(texts('zh'))) {
      if (TOO_LONG_AT_1100.some((x) => text.includes(x))) continue;
      const sentences = piecesCount(text);
      for (const g of GEOMS) {
        const got = cardsAt(text, g).length;
        if (got !== sentences) bad.push(`${g.name}：${text} → ${got} 張（${sentences} 句）`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** 句子數（Mr./Ms./Dr. 後面的句點不算句尾）。 */
function piecesCount(text: string) {
  const out: string[] = [];
  for (const x of (text.match(/[^。！？.!?]+(?:[。！？.!?]+[」』”’)）]*\s*)?/g) ?? [text]).filter(
    (y) => y.trim(),
  )) {
    if (out.length && /\b(?:Mr|Mrs|Ms|Dr|Prof|St|Jr|Sr)\.\s*$/.test(out[out.length - 1]))
      out[out.length - 1] += x;
    else out.push(x);
  }
  return out.length;
}
