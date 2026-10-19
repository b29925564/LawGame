import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIGS } from './rigs';
import { bandNeedsScrim, plateFor } from './scenePlate';

/**
 * 底圖接進場景（scenePlate.tsx）：照「集:場景 id」找，燈組要和場景自己寫的一樣，有語言的圖跟介面語言。
 * plates.test.ts 管 manifest 和劇本對得上；這裡管程式真的會把圖拿出來。
 */
type Plate = { id: string; scene: string; rig: string; lang?: 'zh' | 'en' };
const { plates } = JSON.parse(
  readFileSync(new URL('./plates/plates.json', import.meta.url), 'utf8'),
) as { plates: Plate[] };

describe('場景底圖', () => {
  for (const p of plates) {
    const [ep, id] = p.scene.split(':');
    for (const lang of ['zh', 'en'] as const) {
      const want = p.lang ?? lang;
      if (want !== lang) continue;
      it(`${p.id}：${p.scene} 在 ${lang} 拿得到，色溫讀燈組`, () => {
        const hit = plateFor(ep, { id, rig: p.rig }, lang);
        expect(hit?.id).toBe(p.id);
        expect(hit?.kelvin).toBe(RIGS[p.rig].kelvin);
        expect(hit?.desktop).toMatch(/desktop.*\.jpg$/);
        expect(hit?.phone).toMatch(/phone.*\.jpg$/);
      });
    }
  }

  it('每張有語言的底圖，另一種語言也有一張（不會在英文介面看到中文石楣）', () => {
    for (const p of plates.filter((x) => x.lang)) {
      const mates = plates.filter((x) => x.scene === p.scene && x.rig === p.rig);
      expect(new Set(mates.map((x) => x.lang)), p.scene).toEqual(new Set(['zh', 'en']));
    }
  });

  it('場景的燈組換了，圖就不接（色溫不是圖說了算）', () => {
    const [p] = plates;
    const [ep, id] = p.scene.split(':');
    expect(plateFor(ep, { id, rig: 'ep1-conf-a-thu' }, 'zh')).toBeNull();
    expect(plateFor(ep, { id }, 'zh')).toBeNull();
  });

  it('沒有底圖的場景是 null', () => {
    expect(plateFor('ep1', { id: 'firm-morning', rig: 'ep1-conf-a-thu' }, 'zh')).toBeNull();
  });
});

/** 64×8 的 RGBA；band 這幾列用 rowFill，其餘填 base。 */
function grid(base: number, band?: (x: number) => number) {
  const d = new Uint8ClampedArray(64 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 64; x++) {
      const v = (y === 3 || y === 4) && band ? band(x) : base;
      d.set([v, v, v, 255], (y * 64 + x) * 4);
    }
  return d;
}

describe('自適應襯底的判斷（art bible 10.1，量場景本身的字幕帶）', () => {
  it('暗的底圖不加', () => {
    expect(bandNeedsScrim(grid(60))).toBe(false);
  });
  it('整條都很亮（平均 > 0.35）要加', () => {
    expect(bandNeedsScrim(grid(0, () => 200))).toBe(true);
  });
  it('只有一格近乎純白（最大值 > 0.7）也要加', () => {
    expect(bandNeedsScrim(grid(0, (x) => (x === 10 ? 245 : 0)))).toBe(true);
  });
  it('一格只有中等亮度，不加', () => {
    expect(bandNeedsScrim(grid(0, (x) => (x === 10 ? 200 : 0)))).toBe(false);
  });
  it('帶以外的亮不算', () => {
    expect(bandNeedsScrim(grid(255, () => 0))).toBe(false);
  });
});

describe('人物立牌（standees.json）', () => {
  type Sets = Record<
    string,
    {
      plates: string[];
      size: Record<'desktop' | 'phone', [number, number]>;
      people: { id: string; desktop: F; phone: F }[];
    }
  >;
  type F = { file: string; box: [number, number, number, number] };
  const { sets } = JSON.parse(
    readFileSync(new URL('./plates/standees.json', import.meta.url), 'utf8'),
  ) as { sets: Sets };

  it('每組指到的底圖都在 plates.json，同一張底圖只屬於一組', () => {
    const ids = new Set(plates.map((p) => p.id));
    const seen: string[] = [];
    for (const set of Object.values(sets))
      for (const id of set.plates) {
        expect(ids.has(id), id).toBe(true);
        seen.push(id);
      }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('每個人桌機、手機各一張透明 PNG，框在底圖裡面', () => {
    for (const [name, set] of Object.entries(sets)) {
      expect(set.people.length, name).toBeGreaterThan(0);
      for (const p of set.people)
        for (const v of ['desktop', 'phone'] as const) {
          const { file, box } = p[v];
          expect(existsSync(new URL(`./plates/standee/${file}`, import.meta.url)), file).toBe(true);
          const [w, h] = set.size[v];
          expect(box[0]).toBeGreaterThanOrEqual(0);
          expect(box[1]).toBeGreaterThanOrEqual(0);
          expect(box[0] + box[2]).toBeLessThanOrEqual(w);
          expect(box[1] + box[3]).toBeLessThanOrEqual(h);
        }
    }
  });
});
