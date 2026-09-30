import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import type { VoirDireScene } from './schema';
import * as vd from './voirdire';

const scene = episodes.ep1.scenes.find((s) => s.id === 'voir-dire') as VoirDireScene;

describe('陪審團遴選', () => {
  it('提問次數用完就不能再問，同一個人也只問一次', () => {
    let st = vd.startVoirDire(scene);
    const first = scene.candidates[0].id;
    st = vd.ask(scene, st, first);
    expect(st.left).toBe(scene.questions - 1);
    expect(vd.ask(scene, st, first)).toBe(st);
    for (const c of scene.candidates.slice(1, scene.questions)) st = vd.ask(scene, st, c.id);
    expect(st.left).toBe(0);
    expect(vd.canAsk(st, scene.candidates[10].id)).toBe(false);
  });

  it('有因迴避要對方自己講出偏見；沒問過或沒偏見就聲請，法官記一筆', () => {
    const biased = scene.candidates.find((c) => c.cause)!;
    const clean = scene.candidates.find((c) => !c.cause)!;
    let st = vd.startVoirDire(scene);

    st = vd.challenge(scene, st, biased.id);
    expect(st.excused).toEqual([]);
    expect(st.wrong).toBe(1);

    st = vd.challenge(scene, vd.ask(scene, vd.startVoirDire(scene), biased.id), biased.id);
    expect(st.excused).toContain(biased.id);
    expect(st.wrong).toBe(0);
    expect(vd.pool(scene, st).map((c) => c.id)).not.toContain(biased.id);

    const bad = vd.challenge(scene, vd.ask(scene, st, clean.id), clean.id);
    expect(bad.wrong).toBe(1);
    expect(bad.excused).not.toContain(clean.id);
  });

  it('無因迴避只有三次，而且你砍一位，檢方就砍掉對你最有利的一位', () => {
    let st = vd.startVoirDire(scene);
    const best = [...scene.candidates].sort((a, b) => b.value - a.value)[0];
    st = vd.strike(scene, st, scene.candidates[0].id);
    expect(st.theirs).toContain(best.id);
    // 檢方已經砍掉對辯方最有利的那位，所以第二、三次要從還在席上的人裡挑。
    st = vd.strike(scene, st, vd.pool(scene, st)[0].id);
    st = vd.strike(scene, st, vd.pool(scene, st)[0].id);
    expect(st.struck).toHaveLength(scene.peremptories);
    expect(st.theirs).toHaveLength(scene.peremptories);
    expect(vd.canStrike(scene, st, vd.pool(scene, st)[0].id)).toBe(false);
  });

  it('入席後剛好 12 位，陪審長是領導特質最高的那位', () => {
    let st = vd.seat(scene, vd.startVoirDire(scene));
    expect(st.seated).toHaveLength(scene.seats);
    const panel = vd.panel(scene, st);
    expect(panel.filter((j) => j.foreperson)).toHaveLength(1);
    const chief = panel.find((j) => j.foreperson)!;
    const lead = (id: string) => scene.candidates.find((c) => c.id === id)!.lead;
    expect(Math.max(...panel.map((j) => lead(j.id)))).toBe(lead(chief.id));
    // 選定之後就不能再動。
    st = vd.strike(scene, st, vd.pool(scene, st)[0]?.id ?? '');
    expect(vd.done(st)).toBe(true);
  });

  it('砍太多人就補不滿席位，補不滿就不能入席', () => {
    let st = vd.startVoirDire(scene);
    for (const c of scene.candidates.filter((c) => c.cause)) {
      st = vd.ask(scene, st, c.id);
      st = vd.challenge(scene, st, c.id);
    }
    st = vd.strike(scene, st, vd.pool(scene, st)[0].id);
    expect(vd.canSeat(scene, st)).toBe(true);
    st = vd.strike(scene, st, vd.pool(scene, st)[0].id);
    expect(vd.canSeat(scene, st)).toBe(false);
    expect(vd.seat(scene, st).seated).toBeNull();
  });
});
