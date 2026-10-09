import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import type { Progress } from '../engine/save';
import { currentRow, docketOf } from './Dossier';

const at = (episode: 'ep1' | 'ep2', id: string) =>
  episodes[episode].scenes.findIndex((s) => s.id === id);
const progress = (episode: string, scene: number, more: Partial<Progress> = {}): Progress => ({
  episode,
  scene,
  step: 0,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes: {},
  ...more,
});
const dates = (p: Progress) => docketOf(p).map((r) => (r.done ? r.date.slice(0, 5) : '■'));

describe('案卷登錄表（P2-6；劇本與內容 #234 的規則）', () => {
  it('序號從 1 起不跳號；一行都沒發生時目前行是 −1', () => {
    const rows = docketOf(progress('ep1', 0));
    expect(rows.map((r) => r.no)).toEqual(rows.map((_, i) => i + 1));
    expect(currentRow(rows)).toBe(-1);
  });

  it('還沒走到的卡：卡和沒寫 when 的法院事件畫黑條，寫了 when 的先不列；最後一行判決前一條黑條', () => {
    // 幕卡六張、第三幕前沒寫 when 的檢視令一行、判決一行黑條。
    expect(dates(progress('ep1', 0))).toEqual(['■', '■', '■', '■', '■', '■', '■', '■']);
  });

  it('走過的卡：法院事件排在那張卡前面，寫了 when 的條件成立才列', () => {
    const p = progress('ep1', at('ep1', 'act3'), { cards: ['heart-rate'] });
    expect(dates(p)).toEqual(['03/16', '03/17', '03/19', '03/24', '04/03', '■', '■', '■', '■']);
    expect(docketOf(p)[currentRow(docketOf(p))].date).toBe('04/03/2026');
    // 撤回傳票 D-2 那條分支：03/25 核發與撤銷聲請、03/26 撤回都列，03/31 駁回不列。
    const lost = progress('ep1', at('ep1', 'act3'), { flags: ['chat-audit-lost'] });
    expect(dates(lost).slice(0, 6)).toEqual(['03/16', '03/17', '03/19', '03/25', '03/26', '04/03']);
  });

  it('協商成交：之後的幕卡不列，最後一行是那一種協商', () => {
    const p = progress('ep1', at('ep1', 'act4') + 1, {
      scenes: { 'plea-morrow': { outcome: 'deal', dealId: 'o-manslaughter' } },
    });
    const rows = docketOf(p);
    expect(rows.map((r) => r.date.slice(0, 5))).toEqual([
      '03/16',
      '03/17',
      '03/19',
      '04/03',
      '04/06',
    ]);
    expect(rows.at(-1)!.entry).toContain('非預謀殺人');
    expect(rows.every((r) => r.done)).toBe(true);
  });
});
