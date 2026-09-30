import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import * as closing from './closing';
import type { ClosingScene, DeskScene, TrialScene } from './schema';

const scene = <T>(id: string) => episodes.ep1.scenes.find((s) => s.id === id) as T;
const close = scene<ClosingScene>('closing');
const court = scene<TrialScene>('court-rachel');
const desk = scene<DeskScene>('investigate');
const args = desk.questions.map((q) => q.argument);
const rules = { jurors: court.jurors, threshold: court.threshold };
/** 檢方舉證完畢時的心證：大家都偏有罪，結辯要把他們拉過來。 */
const start = () => closing.startClosing(Object.fromEntries(court.jurors.map((j) => [j.id, 78])));
const three = ['arg-b', 'arg-d', 'arg-a'];

const plan = (picks: string[], tone: string) => {
  let st = start();
  for (const p of picks) st = closing.togglePick(close, st, p);
  return closing.setTone(close, st, tone);
};

describe('結辯', () => {
  it('挑滿了就不能再挑，再點一次是拿掉', () => {
    let st = plan(three, 't-logic');
    expect(st.picked).toEqual(three);
    expect(closing.togglePick(close, st, 'arg-c').picked).toEqual(three);
    st = closing.togglePick(close, st, 'arg-b');
    expect(st.picked).toEqual(['arg-d', 'arg-a']);
    expect(closing.canDeliver(close, st)).toBe(false);
  });

  it('最後一個論點的衝擊比較大（近因效應）', () => {
    const lean = (st: closing.ClosingState) =>
      Object.values(st.jury).reduce((a, b) => a + b, 0) / 12;
    const strong = closing.deliver(
      close,
      plan(['arg-a', 'arg-d', 'arg-b'], 't-logic'),
      rules,
      args,
    );
    const weak = closing.deliver(close, plan(['arg-b', 'arg-d', 'arg-a'], 't-logic'), rules, args);
    // 論點 B 最強（25），放在最後說服力更高。
    expect(lean(strong)).toBeLessThan(lean(weak));
  });

  it('洩漏過的論點，結辯再講一次也只剩一半', () => {
    const clean = closing.deliver(close, plan(three, 't-logic'), rules, args);
    const leaked = closing.deliver(close, plan(three, 't-logic'), rules, args, ['arg-b']);
    const lean = (st: closing.ClosingState) =>
      Object.values(st.jury).reduce((a, b) => a + b, 0) / 12;
    expect(lean(leaked)).toBeGreaterThan(lean(clean));
  });

  it('三輪評議之後才有判決，判決是全體一致或僵局', () => {
    const st = closing.deliver(close, plan(three, 't-logic'), rules, args);
    expect(st.rounds).toHaveLength(3);
    expect(['無罪', '有罪', '陪審團僵局']).toContain(st.verdict);
    expect(closing.done(st)).toBe(true);
    // 判決出來之後就不能再改結辯內容。
    expect(closing.togglePick(close, st, 'arg-c')).toBe(st);
  });

  it('基調說中誰，誰就被說服得多', () => {
    const after = (tone: string) => closing.deliver(close, plan(three, tone), rules, args).spoken!;
    const feel = after('t-feel');
    const logic = after('t-logic');
    // j3 的取向是「情感」：情感基調對他最有效。
    expect(feel.j3).toBeLessThan(logic.j3);
    // j5 的取向是「程序」：換成程序正義，他才是被說動最多的那一個。
    expect(after('t-due').j5).toBeLessThan(feel.j5);
  });

  it('心證離門檻 10 以上的陪審員，多數拉不動他', () => {
    // 一個站得很遠的人：多數的拉票對他無效（企劃書 6.10），
    // 只有陪審長那 2 點推得動他，所以評議不是想掃誰就掃得掉誰。
    const split = Object.fromEntries(
      court.jurors.map((j, i) => [j.id, i === 0 ? 100 : i < 7 ? 40 : 66]),
    );
    const st = { ...closing.startClosing(split), picked: [], tone: 't-logic' };
    const out = closing.deliver(close, { ...st, picked: three }, rules, args);
    expect(out.rounds[0].jury.j1).toBeGreaterThan(court.threshold + 5);
  });
});
