import { afterEach, describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { negoScene, useEpisode, witnessScene } from '../game';
import type { Progress } from '../save';
import * as nego from './negotiation';
import * as defense from './defense';
import { playEp2, type Ep2Route } from './ep2-route';
import type { DefenseScene, DeskScene, NegotiationScene, VoirDireScene } from './schema';

const ep = episodes.ep2;
const scene = <T>(id: string) => ep.scenes.find((s) => s.id === id) as T;
const args = ep.scenes
  .filter((s): s is DeskScene => s.type === 'desk')
  .flatMap((d) => d.questions.map((q) => q.argument));
const raw = scene<DefenseScene>('defense-trevor');

afterEach(() => useEpisode.getState().toTitle());

interface Route {
  daubert?: boolean;
  object?: boolean;
  confront?: boolean;
  coach?: boolean;
  /** 問了被教過的那一題（「一直都是這樣嗎」），反詰問就會翻出變更單、問出是誰教的。 */
  always?: boolean;
  /** 開示時硬藏了群組截圖（不利推定）。 */
  concealed?: number;
  /** 案件理論：結辯講它要的論點，並承擔它在陪審團心裡的代價。沒給就是「他自己的選擇」。 */
  theory?: string;
  /** 審前留下的旗標（開示交出了什麼、有沒有更正筆錄）：決定 effects 的代價與崔佛那一場的題目。 */
  flags?: string[];
}

const before = (flags: string[] = [], chosen?: string): Progress => ({
  episode: 'ep2',
  scene: 0,
  step: 0,
  choices: {},
  cards: [],
  flags,
  ethics: [],
  scenes: chosen ? { theory: { chosen, skipped: false } } : {},
});

/** 判決。 */
const verdict = (r: Route) => run(r).verdict;
/** 評議後仍判有責的陪審員人數。 */
const against = (r: Route) => run(r).afterDeliberation;
/** 結辯講完、評議之前倒向對方的人數（代價看得到，但評議可能又拉回來）。 */
const spoken = (r: Route) => run(r).afterClosing;

/**
 * 走遊戲本身的流程（選理論 → 遴選 → 開場 → 三場庭審 → 崔佛 → 結辯與評議），
 * 審前動議、硬藏、開場承諾都照實玩算。沒給理論就當作「他自己的選擇」（結辯講論點 A、B）。
 */
function run(r: Route) {
  const flags = r.flags ?? [];
  const x = playEp2({
    theory: (r.theory ?? 'own-choice') as Ep2Route['theory'],
    chat:
      r.concealed || flags.includes('discovery:rq-chat:concealed')
        ? 'conceal'
        : flags.includes('discovery:rq-chat:produced')
          ? 'produce'
          : undefined,
    corrected: flags.includes('trevor-corrected'),
    daubert: r.daubert,
    always: r.always,
    coach: r.coach,
    object: r.object,
    confront: r.confront,
  });
  const jury = (x.progress.scenes.closing as { jury: Record<string, number> }).jury;
  return { ...x, jury };
}

const best = { object: true, confront: true };

/** 崔佛那一題的處理不在這一組比較：都當作更正過筆錄（沉默與偽證另外比）。 */
const fixed = 'trevor-corrected';
const honest = { ...best, flags: [fixed] };

/** 民事是優勢證據：打得好可以贏，但被抓到輔導證人、硬藏文件，就撐不住。 */
describe('第 2 集的庭審平衡', () => {
  it('異議全對、三場都對質、崔佛老實作證：無責', () => {
    expect(verdict(honest)).toBe('無責');
    expect(verdict({ ...honest, daubert: true })).toBe('無責');
  });

  it('同樣打得好，但輔導過的崔佛在反詰問露餡：有責', () => {
    expect(verdict({ ...best, coach: true, always: true })).toBe('有責');
  });

  it('輔導了但沒問到教過的那一題，沒露餡：仍然無責（這就是誘惑）', () => {
    expect(verdict({ ...best, coach: true })).toBe('無責');
  });

  it('只異議不對質，或什麼都不做：有責', () => {
    expect(verdict({ object: true, flags: [fixed] })).toBe('有責');
    expect(verdict({})).toBe('有責');
  });

  it('只對質不異議：維加太太多了兩項主張可以對質，勉強能贏；只異議不行', () => {
    expect(verdict({ confront: true, flags: [fixed] })).toBe('無責');
  });

  it('硬藏一項被揭穿（不利推定）又輔導露餡：有責', () => {
    expect(verdict({ ...best, concealed: 1, coach: true, always: true })).toBe('有責');
  });

  it('理論的風險不同：每一場都打到最好，三種理論都能贏', () => {
    for (const theory of ['own-choice', 'warned', 'shared'])
      expect(verdict({ ...honest, theory })).toBe('無責');
  });

  it('打得普通（只對質不異議）：他自己的選擇還撐得住，分攤就判有責', () => {
    expect(verdict({ confront: true, theory: 'own-choice', flags: [fixed] })).toBe('無責');
    expect(verdict({ confront: true, theory: 'shared', flags: [fixed] })).toBe('有責');
  });
});

/** 崔佛提案的審前代價：交出群組截圖、更正筆錄。 */
describe('第 2 集審前選擇的代價', () => {
  const chat = 'discovery:rq-chat:produced';
  const theories = ['own-choice', 'warned', 'shared'];

  it('交出群組截圖又更正筆錄：每一場都打到最好（含 Daubert），三種理論都能贏', () => {
    for (const theory of theories) {
      expect(verdict({ ...best, daubert: true, theory, flags: [chat, fixed] })).toBe('無責');
      if (theory !== 'warned')
        expect(verdict({ ...best, theory, flags: [chat, fixed] })).toBe('無責');
    }
  });

  it('「我們提醒過」交出截圖又更正筆錄：結辯時掉的人比「他自己的選擇」多（提案第五節：更正對它傷最大）', () => {
    const flags = [chat, fixed];
    expect(spoken({ ...best, theory: 'warned', flags })).toBeGreaterThan(
      spoken({ ...best, theory: 'own-choice', flags }),
    );
    expect(verdict({ ...best, theory: 'warned', flags: [fixed] })).toBe('無責');
  });

  it('交出群組截圖的代價：只對質不異議時，「我們提醒過」和「分攤」判有責，「他自己的選擇」也多人倒向對方', () => {
    for (const theory of ['warned', 'shared'])
      expect(verdict({ confront: true, theory, flags: [chat, fixed] })).toBe('有責');
    expect(spoken({ confront: true, theory: 'own-choice', flags: [chat, fixed] })).toBeGreaterThan(
      spoken({ confront: true, theory: 'own-choice', flags: [fixed] }),
    );
  });

  it('更正筆錄：「我們提醒過」在陪審團那邊要付，另外兩個理論不付（代價在調解與客戶信任）', () => {
    const warned = (flags: string[]) => run({ ...best, theory: 'warned', flags }).jury;
    expect(warned([fixed])).not.toEqual(warned([]));
  });
});

/**
 * 遊戲測試員 2026-10-03：「不更正也不問」原本三個理論都零代價、嚴格最佳。
 * 筆錄是奧卡福錄的，崔佛一上證人席，對方照樣拿筆錄和變更單彈劾他（tx-sworn）。
 * 倫理照使用者的決定不記；代價在陪審團，更正的代價在調解與客戶信任，兩邊各有輸贏。
 */
describe('崔佛那一句：更正、沉默、還是讓他再說一次', () => {
  const chat = 'discovery:rq-chat:produced';
  const theories = ['own-choice', 'warned', 'shared'];

  it('沉默在陪審團那邊不比更正好：三個理論、同樣打法，倒向對方的人數不會更少', () => {
    for (const theory of theories)
      for (const r of [best, { ...best, daubert: true }, { confront: true }])
        for (const extra of [[], [chat]]) {
          const quiet = { ...r, theory, flags: extra };
          const corrected = { ...r, theory, flags: [...extra, fixed] };
          expect(against(quiet)).toBeGreaterThanOrEqual(against(corrected));
        }
  });

  it('「分攤」靠說實話：沉默沒有 Daubert 就贏不了，有 Daubert 也比更正多掉人；更正就贏', () => {
    expect(verdict({ ...best, theory: 'shared' })).not.toBe('無責');
    expect(spoken({ ...best, daubert: true, theory: 'shared' })).toBeGreaterThan(
      spoken({ ...best, daubert: true, theory: 'shared', flags: [fixed] }),
    );
    expect(verdict({ ...best, theory: 'shared', flags: [fixed] })).toBe('無責');
  });

  it('沉默仍是誘惑：「他自己的選擇」打滿照樣贏，而且不必付調解與信任的代價', () => {
    expect(verdict({ ...best, theory: 'own-choice' })).toBe('無責');
    expect(verdict({ ...best, theory: 'own-choice', flags: [chat] })).toBe('無責');
  });

  it('讓他再說一次就不另外問 tx-sworn（door 已是同一個彈劾，不重複扣）', () => {
    const asked = run({ ...best, theory: 'warned', always: true });
    expect(asked.verdict).toBeDefined();
    const w = witnessScene(before([], 'warned'), raw);
    const st = defense.finish(
      w,
      { ...defense.startDefense({}), stage: 'direct', prep: 'trevor-honest', asked: ['tq-always'] },
      { jurors: [], threshold: 50 },
    );
    expect(st.log.some((l) => l.text.includes('您在錄取時宣誓說'))).toBe(false);
    const quiet = defense.finish(
      w,
      { ...defense.startDefense({}), stage: 'direct', prep: 'trevor-honest', asked: [] },
      { jurors: [], threshold: 50 },
    );
    expect(quiet.log.some((l) => l.text.includes('您在錄取時宣誓說'))).toBe(true);
  });
});

/** 體驗評測 2026-10-03：藏截圖、不更正、庭上讓崔佛再說一次假話又被變更單打臉，不能和誠實的路線一樣 6:0。 */
describe('不誠實又被抓到的路線', () => {
  const produced = 'discovery:rq-chat:produced';
  const concealed = 'discovery:rq-chat:concealed';
  const theories = ['own-choice', 'warned', 'shared'];
  const honest = (theory: string) => ({
    ...best,
    daubert: true,
    theory,
    flags: [produced, 'trevor-corrected'],
  });
  const caught = (theory: string, daubert = false) => ({
    ...best,
    daubert,
    theory,
    concealed: 1,
    always: true,
    flags: [concealed],
  });

  it('其他都打到最好：誠實的路線（含 Daubert）三種理論都無責；藏了又讓他再說一次假話的，有沒有 Daubert 三種都有責', () => {
    for (const theory of theories) {
      expect(verdict(honest(theory))).toBe('無責');
      expect(verdict(caught(theory))).toBe('有責');
      expect(verdict(caught(theory, true))).toBe('有責');
    }
  });

  it('體驗評測 v88 實玩的那一條：他自己的選擇、藏截圖、不更正、錄取全不擋、讓崔佛再說一次、有 Daubert', () => {
    // 修正前：庭審後 1 位、結辯後 2 位倒向對方，評議又拉回 0 位，判無責。
    const x = playEp2({
      theory: 'own-choice',
      chat: 'conceal',
      always: true,
      daubert: true,
      object: true,
      confront: true,
    });
    expect(x.verdict).toBe('有責');
    expect(x.progress.scenes['defense-trevor']).toMatchObject({
      log: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('陪審團該相信哪一個您') }),
      ]),
    });
  });

  it('遴選怎麼砍都救不回來：藏了又讓他再說一次，有 Daubert，任兩位無因迴避都判有責', () => {
    const vd = ep.scenes.find((x) => x.type === 'voirdire') as VoirDireScene;
    const ids = vd.candidates.map((c) => c.id);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        expect(
          playEp2({
            theory: 'own-choice',
            chat: 'conceal',
            always: true,
            daubert: true,
            object: true,
            confront: true,
            strikes: [ids[i], ids[j]],
          }).verdict,
        ).toBe('有責');
  });

  it('藏不能比交便宜：被揭穿時對方照樣拿到截圖，再加不利推定', () => {
    for (const theory of theories) {
      const hide = { ...best, theory, concealed: 1, flags: [concealed] };
      const give = { ...best, theory, flags: [produced] };
      expect(run(hide).jury).not.toEqual(run(give).jury);
      expect(against(hide)).toBeGreaterThanOrEqual(against(give));
    }
    // 「我們提醒過」更正：藏了，結辯時倒向對方的人比交出多。
    const warned = { ...best, theory: 'warned' };
    expect(
      spoken({ ...warned, concealed: 1, flags: [concealed, 'trevor-corrected'] }),
    ).toBeGreaterThan(spoken({ ...warned, flags: [produced, 'trevor-corrected'] }));
  });

  it('沒藏，只是讓他再說一次被打臉：交出截圖的「我們提醒過」從無責變成有責', () => {
    expect(verdict({ ...best, theory: 'warned', flags: [produced] })).toBe('無責');
    expect(verdict({ ...best, theory: 'warned', always: true, flags: [produced] })).toBe('有責');
  });
});

/** 遊戲測試員 2026-10-03：交出群組截圖後奧卡福信心 +10，調解變難，但要談得成。 */
describe('交出群組截圖後的調解', () => {
  const n = scene<NegotiationScene>('mediation');
  const strength = (id: string) => args.find((a) => a.id === id)!.strength;
  const held = ['med-record', 'pharmacy', 'daubert-ruling'];
  const play = (flags: string[], moves: string[]) => {
    const s = negoScene(before(flags), n);
    let st = nego.startNegotiation(s);
    for (const m of moves)
      st =
        m === 'call'
          ? nego.call(s, st)
          : m.startsWith('b-')
            ? nego.bluff(s, st, m, held)
            : nego.reveal(s, st, m, strength(m), m);
    return nego.advise(s, st, true);
  };
  const chat = ['discovery:rq-chat:produced'];

  it('只攤論點 A 再打兩通電話：沒交出時能和解，交出後奧卡福不降到授權內（這是交出的代價）', () => {
    expect(play([], ['arg-a', 'call', 'call']).outcome).toBe('deal');
    expect(play(chat, ['arg-a', 'call', 'call']).outcome).toBeNull();
  });

  it('交出後仍談得成：攤 A、兩個有憑據的虛張，再請示兩次（250 萬）或一次（多攤 B，180 萬）', () => {
    const a = play(chat, ['arg-a', 'b-meds', 'b-expert', 'call', 'call']);
    expect(a.outcome).toBe('deal');
    expect(a.deal).toContain('250');
    const b = play(chat, ['arg-a', 'arg-b', 'b-meds', 'b-expert', 'call']);
    expect(b.outcome).toBe('deal');
    expect(b.deal).toContain('180');
  });

  it('藏截圖不影響調解（奧卡福還不知道）；再交出意見書時信心剛好卡在 400 萬，多攤一個論點就降到 250 萬', () => {
    const hid = ['discovery:rq-chat:concealed'];
    const memo = 'discovery:rq-memo:produced';
    expect(play(hid, ['arg-a', 'call', 'call']).outcome).toBe('deal');
    expect(play([...hid, memo], ['arg-a', 'call', 'call']).outcome).toBeNull();
    expect(play([...hid, memo], ['arg-a', 'arg-b', 'call', 'call']).outcome).toBe('deal');
    // 兩樣都交出：攤兩個論點還不夠，要再加一個有憑據的虛張。
    expect(play([...chat, memo], ['arg-a', 'arg-b', 'b-meds', 'call', 'call']).outcome).toBe(
      'deal',
    );
  });
});
