import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { courtScene, useEpisode } from '../game';
import type { TrialScene, VoirDireScene } from './schema';
import type * as trial from './trial';
import * as vd from './voirdire';

const scene = episodes.ep1.scenes.find((s) => s.id === 'voir-dire') as VoirDireScene;
const kowalski = episodes.ep1.scenes.find((s) => s.id === 'court-kowalski') as TrialScene;

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

  it('明確偏向辯方的候選人，檢方入席前會以有因迴避剔除；偏向檢方的留給玩家處理', () => {
    const st = vd.seat(scene, vd.startVoirDire(scene));
    expect(st.theirCause).toEqual(['c-fired']);
    expect(st.seated).not.toContain('c-fired');
    expect(st.seated).toContain('c-broker');
  });

  it('候選席只剩 12 位時，檢方的有因迴避不會把席位剔到坐不滿', () => {
    let st = vd.startVoirDire(scene);
    while (vd.pool(scene, st).some((c) => c.id !== 'c-fired' && vd.canStrike(scene, st, c.id)))
      st = vd.strike(scene, st, vd.pool(scene, st).find((c) => c.id !== 'c-fired')!.id);
    const room = vd.pool(scene, st).length - scene.seats;
    st = vd.seat(scene, st);
    expect(st.seated).toHaveLength(scene.seats);
    expect(st.theirCause!.length).toBeLessThanOrEqual(room);
  });

  it('候選席剩 12 位就不能再無因迴避，檢方也不會再砍', () => {
    let st = vd.startVoirDire(scene);
    for (const c of scene.candidates.filter((c) => c.cause)) {
      st = vd.ask(scene, st, c.id);
      st = vd.challenge(scene, st, c.id);
    }
    while (vd.pool(scene, st).some((c) => vd.canStrike(scene, st, c.id)))
      st = vd.strike(scene, st, vd.pool(scene, st)[0].id);
    expect(vd.pool(scene, st).length).toBeGreaterThanOrEqual(scene.seats);
    expect(vd.canSeat(scene, st)).toBe(true);
  });
});

describe('遴選之後的法庭', () => {
  const at = (id: string) => episodes.ep1.scenes.findIndex((s) => s.id === id);

  /** 遴選完成、12 位入席，遊戲停在科瓦斯基那一場庭審。 */
  const seated = () => {
    const st = vd.seat(scene, vd.startVoirDire(scene));
    useEpisode.setState({
      mode: 'play',
      progress: {
        episode: 'ep1',
        scene: at('court-kowalski'),
        step: 0,
        choices: {},
        cards: [],
        scenes: { [scene.id]: st },
      },
    });
    return vd.panel(scene, st).map((j) => j.id);
  };

  it('上場的陪審員就是遴選留下的那 12 位', () => {
    const ids = seated();
    expect(courtScene(useEpisode.getState().progress, kowalski).jurors.map((j) => j.id)).toEqual(
      ids,
    );
  });

  /**
   * 以前庭審的動作拿到的是劇本裡的預設陪審團，心證因此記在沒有上場的人身上：
   * 畫面上那 12 張臉整場不動，數值還會算成 NaN。
   */
  it('主詰問推動的是上場的那 12 位，不是劇本的預設陪審團', () => {
    const ids = seated();
    const { nextQuestion, letPass } = useEpisode.getState();
    for (let i = 0; i < kowalski.witness.direct.length; i++) {
      nextQuestion();
      if ((useEpisode.getState().progress.scenes['court-kowalski'] as trial.TrialState).window)
        letPass();
    }
    const st = useEpisode.getState().progress.scenes['court-kowalski'] as trial.TrialState;
    expect(Object.keys(st.jury).sort()).toEqual([...ids].sort());
    for (const id of ids) expect(Number.isFinite(st.jury[id])).toBe(true);
    // 檢方舉證完，12 個人都偏有罪，交叉詰問才有東西可以拉。
    expect(ids.every((id) => st.jury[id] >= kowalski.threshold)).toBe(true);
  });
});

describe('遴選不會卡死（QA fuzz：有因迴避＋兩造砍滿後坐不滿）', () => {
  it('先剔除一位有因、兩造各砍三位、再剔除其餘有因：仍然坐得滿 12 位', () => {
    const causes = scene.candidates.filter((c) => c.cause).map((c) => c.id);
    let st = vd.startVoirDire(scene);
    for (const id of causes) st = vd.ask(scene, st, id);
    st = vd.challenge(scene, st, causes[0]);
    for (let i = 0; i < scene.peremptories; i++) {
      const target = vd.pool(scene, st).find((c) => !c.cause && vd.canStrike(scene, st, c.id))!;
      st = vd.strike(scene, st, target.id);
    }
    for (const id of causes.slice(1)) st = vd.challenge(scene, st, id);
    expect(st.excused).toHaveLength(causes.length);
    expect(vd.canSeat(scene, st)).toBe(true);
  });
});
