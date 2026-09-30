import { describe, expect, it } from 'vitest';
import { cases } from '../content';
import {
  setRelation,
  startBoard,
  submit,
  toggleCard,
  confirmedArguments,
  type BoardState,
} from './board';
import * as x from './cross';
import { startJury } from './jury';
import type { CaseData } from './schema';
import { validateCase } from './validate';

const c = cases.proto;

function solveAll(): BoardState {
  let b = startBoard(c);
  for (const q of c.questions) {
    for (const id of q.answer) b = toggleCard(c, b, q.id, id);
    b = setRelation(b, q.id, q.relation);
    b = submit(c, b, q.id).board;
  }
  return b;
}

const arg = (id: string) => c.questions.map((q) => q.argument).find((a) => a.id === id)!;

describe('證據板', () => {
  it('整條全對才確認，每次提交花 1 工時', () => {
    let b = startBoard(c);
    b = toggleCard(c, b, 'q1', 'watch-note');
    b = toggleCard(c, b, 'q1', 'fingerprint');
    b = setRelation(b, 'q1', '支持');
    const r = submit(c, b, 'q1');
    expect(r.ok).toBe(false);
    expect(r.board.hours).toBe(c.hours - 1);
    expect(r.board.confirmed).toEqual([]);
  });

  it('關係選錯也不算對', () => {
    let b = startBoard(c);
    b = toggleCard(c, b, 'q1', 'watch-note');
    b = toggleCard(c, b, 'q1', 'uber');
    b = setRelation(b, 'q1', '矛盾');
    expect(submit(c, b, 'q1').ok).toBe(false);
  });

  it('一次全對可以確認所有論點', () => {
    const b = solveAll();
    expect(confirmedArguments(c, b).map((a) => a.id)).toEqual(['arg-a', 'arg-b', 'arg-d', 'arg-e']);
    expect(b.hours).toBe(c.hours - c.questions.length);
  });

  it('工時用完不能再提交', () => {
    let b: BoardState = { ...startBoard(c), hours: 0 };
    b = toggleCard(c, b, 'q1', 'watch-note');
    b = toggleCard(c, b, 'q1', 'uber');
    b = setRelation(b, 'q1', '支持');
    expect(submit(c, b, 'q1').ok).toBe(false);
  });
});

describe('彈劾三步驟', () => {
  const start = () => x.toWitness(c, x.startCross(c, startJury(c)));

  it('缺乏證據基礎時異議成立，扣法官耐心且無衝擊', () => {
    const s = x.confront(c, x.lock(c, start(), 'meeting', 'strong'), 'meeting', arg('arg-e'));
    expect(s.patience).toBe(c.patience - 1);
    expect(s.claims.meeting.result).toBe('none');
  });

  it('鎖定＋鋪陳＋對質＝彈劾成功，衝擊比沒鎖死大', () => {
    let good = x.lock(c, start(), 'meeting', 'strong');
    good = x.setup(c, good, 'meeting');
    good = x.confront(c, good, 'meeting', arg('arg-e'));
    let weak = x.lock(c, start(), 'meeting', 'weak');
    weak = x.setup(c, weak, 'meeting');
    weak = x.confront(c, weak, 'meeting', arg('arg-e'));
    const sum = (j: Record<string, number>) => Object.values(j).reduce((a, b) => a + b, 0);
    expect(good.claims.meeting.result).toBe('impeached');
    expect(weak.claims.meeting.result).toBe('softened');
    expect(sum(good.jury)).toBeLessThan(sum(weak.jury));
  });

  it('專家證人承認心率資料可靠，就等於替瑞秋的對質鋪陳', () => {
    let s = x.askExpert(c, x.startCross(c, startJury(c)), 'watch');
    s = x.toWitness(c, s);
    expect(x.hasFoundation(c, s, 'thud')).toBe(true);
  });

  it('重複發問算糾纏，耐心歸零時法官訓斥並結束詰問', () => {
    let s = start();
    for (let i = 0; i < c.patience + 1; i++) s = x.lock(c, s, 'thud', 'weak');
    expect(s.rebuked).toBe(true);
    expect(s.stage).toBe('closing');
  });
});

/** 數值平衡：兩次以上彈劾成功才有機會無罪；沒鎖死或只彈劾一次都會輸。 */
describe('陪審團平衡', () => {
  type Plan = ('strong' | 'weak' | null)[];
  function play(plan: Plan, closing = true) {
    const b = solveAll();
    let s = x.askExpert(c, x.startCross(c, startJury(c)), 'watch');
    s = x.toWitness(c, s);
    c.witness.claims.forEach((cl, i) => {
      const how = plan[i];
      if (!how) return;
      s = x.lock(c, s, cl.id, how);
      s = x.setup(c, s, cl.id);
      s = x.confront(c, s, cl.id, arg(cl.argument));
    });
    const args = closing ? confirmedArguments(c, b).slice(0, 3) : [];
    return x.closing(c, x.toClosing(s), args, '邏輯');
  }

  it('三次彈劾都成功，瑞秋援引緘默權，判決無罪', () => {
    const s = play(['strong', 'strong', 'strong']);
    expect(s.fifth).toBe(true);
    expect(s.verdict).toBe('無罪');
  });

  // 特質倍率補上 0.5 之後（企劃書 6.10），說詞說不中的陪審員幾乎不動，
  // 所以兩次彈劾會留下死不鬆口的人：僵局，不是無罪也不是有罪。
  it('兩次彈劾成功：陪審團僵局', () => {
    expect(play(['strong', 'strong', null]).verdict).toBe('陪審團僵局');
  });

  it('只彈劾一次：有罪', () => {
    expect(play(['strong', null, null]).verdict).toBe('有罪');
  });

  it('三個矛盾都對質但都沒鎖死：有罪', () => {
    expect(play(['weak', 'weak', 'weak']).verdict).toBe('有罪');
  });

  it('不詰問也不結辯：有罪', () => {
    expect(play([null, null, null], false).verdict).toBe('有罪');
  });
});

describe('validateCase', () => {
  it('原型劇本通過', () => {
    expect(validateCase(c)).toEqual([]);
  });

  it('抓出引用不存在卡片的疑問', () => {
    const broken: CaseData = structuredClone(c);
    broken.questions[0].answer = ['watch-note', 'nope'];
    expect(validateCase(broken)).toContain('疑問 q1 的正解引用了不存在的卡片 nope');
  });
});
