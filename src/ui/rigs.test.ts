import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { RIGS, rigOf } from './rigs';

/**
 * 每場戲的燈組（設定集第 10 章 :108、第 11 章 :74；設計師 2026-10-10）：場記右欄的色溫讀 rigs.yaml，
 * 不再用地點字串猜。這裡擋三件事：有地點的就要有燈組、燈組不能沒人用、燈組的日子時刻和地點寫的一樣。
 */
type Node = Record<string, unknown>;
type Hit = { at: string; place?: string; rig?: string };

/** 劇本裡寫了 place 或 rig 的物件（場景、聲請反轉的選項、法庭日卡）。手機裡的刷卡畫面（do: badge）的 place 是門禁機上的字，不是場記。 */
function hits(raw: unknown, at: string, acc: Hit[]) {
  if (Array.isArray(raw)) raw.forEach((x, i) => hits(x, `${at}[${i}]`, acc));
  else if (raw && typeof raw === 'object') {
    const o = raw as Node;
    const where = o.id ? `${at}(${String(o.id)})` : at;
    if (!('do' in o) && ('place' in o || 'rig' in o))
      acc.push({ at: where, place: o.place as string, rig: o.rig as string });
    for (const [k, v] of Object.entries(o)) hits(v, `${where}.${k}`, acc);
  }
  return acc;
}

const read = (ep: string) =>
  parse(readFileSync(new URL(`../content/${ep}.yaml`, import.meta.url), 'utf8')) as Node & {
    scenes: Node[];
  };
const [ep1, ep2] = [read('ep1'), read('ep2')];
const all = [hits(ep1.scenes, 'ep1', []), hits(ep2.scenes, 'ep2', [])].flat();

/** 沒有場戲指到、但留著的燈組，要寫出理由。 */
const UNUSED: Record<string, string> = {
  'court-verdict':
    '第 4 章四組時段燈組之一（判決 16:40）。判決在結辯那一場裡演，場記讀的是第三日；這組留給判決那一格的鏡頭，目前程式沒有讀',
};

describe('燈組', () => {
  it('有地點的場景都指定了燈組，而且燈組存在', () => {
    const bad = all
      .filter((h) => h.place && (!h.rig || !RIGS[h.rig]))
      .map((h) => `${h.at}: ${h.place} → ${h.rig ?? '（沒寫 rig）'}`);
    expect(bad).toEqual([]);
  });

  it('只寫了 rig 的（法庭日卡）也要存在', () => {
    expect(all.filter((h) => h.rig && !RIGS[h.rig]).map((h) => h.at)).toEqual([]);
  });

  it('每一組燈組都有場戲用到', () => {
    const used = new Set(all.map((h) => h.rig));
    expect(Object.keys(RIGS).filter((k) => !used.has(k) && !UNUSED[k])).toEqual([]);
  });

  it('燈組的日子、時刻和地點寫的一樣（場記右欄的字和色溫來自同一場戲）', () => {
    const bad = all.flatMap((h) => {
      if (!h.place || !h.rig || !RIGS[h.rig]) return [];
      const r = RIGS[h.rig];
      const time = /(\d{1,2}:\d{2})/.exec(h.place)?.[1] ?? '';
      const day = /\u3000(週.|隔天|一週後|兩週後)/.exec(h.place)?.[1] ?? '';
      // 地點沒寫時刻的是法庭：日子時刻讀燈組（第一日 09:00 等）。
      if (!time) return [];
      return r.time === time && r.label === day
        ? []
        : [`${h.at}: ${h.place} ≠ ${h.rig}（${r.label} ${r.time}）`];
    });
    expect(bad).toEqual([]);
  });

  it('寫了 rig 的卡，場記讀的下一場是法庭（地點沒寫時刻），不是別的房間', () => {
    for (const ep of [ep1, ep2]) {
      const scenes = ep.scenes as Node[];
      scenes.forEach((s, i) => {
        if (s.type !== 'card' || !s.rig) return;
        const next = scenes.slice(i + 1).find((x) => x.place);
        expect(`${String(s.id)} → ${String(next?.place)}`).not.toMatch(/\d{1,2}:\d{2}|undefined/);
      });
    }
    const days = (ep1.scenes as Node[]).filter((s) => s.type === 'card' && s.rig).map((s) => s.rig);
    expect(days).toEqual(['court-d1-am', 'court-d2-pm', 'court-d3-ov']);
  });

  it('rigOf 讀地點帶的 rig 鍵，沒有就是 null', () => {
    expect(rigOf({ rig: 'ep2-lucas-office-night' })?.kelvin).toBe(2700);
    expect(rigOf({ rig: 'court-d3-ov' })).toMatchObject({ label: '第三日', kelvin: 6500 });
    expect(rigOf({})).toBeNull();
    expect(rigOf({ rig: 'no-such-rig' })).toBeNull();
  });
});
