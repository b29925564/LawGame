import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RIGS } from './rigs';
import { plateFor } from './scenePlate';

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
