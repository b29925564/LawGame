import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { episodes } from '../../content';
import { STRUCK_DEFAULT } from '../../engine/episode/trial';
import { install, translate } from '../../i18n';
import { judgeCards, subEm } from './subtitleSplit';

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
