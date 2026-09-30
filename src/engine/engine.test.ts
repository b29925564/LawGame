import { describe, expect, it } from 'vitest';
import { cases } from '../content';
import type { CaseData } from './schema';
import { move, outcome, present, startTrial } from './trial';
import { validateCase } from './validate';

const ep1 = cases.ep1;

describe('validateCase', () => {
  it('抓出無法取得的矛盾證據', () => {
    const broken: CaseData = structuredClone(ep1);
    broken.documents = broken.documents.filter((d) => !d.evidence.includes('call-log'));
    const errors = validateCase(broken);
    expect(errors).toContain('證據 call-log 沒有任何文件可以取得');
    expect(errors.some((e) => e.includes('s-alone'))).toBe(true);
  });

  it('抓出沒有矛盾的審判', () => {
    const broken: CaseData = structuredClone(ep1);
    broken.trial.statements = broken.trial.statements.map((s) => ({
      ...s,
      contradiction: undefined,
    }));
    expect(validateCase(broken)).toContain('審判沒有任何矛盾，無法勝訴');
  });
});

describe('交互詰問', () => {
  it('出示正確證據破解所有矛盾即勝訴', () => {
    let t = startTrial(ep1);
    ep1.trial.statements.forEach((s, i) => {
      t = { ...t, index: i };
      if (s.contradiction) t = present(ep1, t, s.contradiction.evidence);
    });
    expect(outcome(ep1, t)).toBe('win');
    expect(t.persuasion).toBe(ep1.trial.persuasion);
  });

  it('出示錯誤證據扣說服度，歸零即敗訴', () => {
    let t = startTrial(ep1);
    for (let i = 0; i < ep1.trial.persuasion; i++) t = present(ep1, t, 'inventory');
    expect(outcome(ep1, t)).toBe('lose');
  });

  it('同一個矛盾不能重複計分', () => {
    let t = move(ep1, startTrial(ep1), 1);
    t = present(ep1, t, 'cctv-store');
    t = present(ep1, t, 'cctv-store');
    expect(t.resolved).toEqual(['s-saw']);
    expect(t.persuasion).toBe(ep1.trial.persuasion);
  });

  it('證詞可以循環切換', () => {
    const t = move(ep1, startTrial(ep1), -1);
    expect(t.index).toBe(ep1.trial.statements.length - 1);
  });
});
