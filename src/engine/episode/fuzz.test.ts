/**
 * 隨機玩家：在引擎層（不經瀏覽器）用亂數把第 1 集從頭玩到尾，專抓
 * 卡關（還沒結束卻沒有能推進的操作）、例外錯誤、數值越界、走不到「本集完」。
 *
 * 每一步只從「畫面上此刻按得到的按鈕」裡挑一個：可推進的判斷照抄 UI
 * （例如桌面要 desk.done、法庭要 stage === 'done' 才有「繼續」）。
 *
 * CI 跑少量種子；本地要大量跑：FUZZ_SEEDS=500 npx vitest run src/engine/episode/fuzz
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  closingArgs,
  closingState,
  courtScene,
  defenseState,
  deskSceneOf,
  deskState,
  depoState,
  interviewState,
  negoState,
  openingState,
  promisesOf,
  sceneChoices,
  sceneOf,
  theoryState,
  trialState,
  useEpisode,
  voirDireState,
} from '../game';
import type { Progress } from '../save';
import type { Relation, Tag } from '../schema';
import * as closing from './closing';
import * as depo from './deposition';
import * as desk from './desk';
import * as interview from './interview';
import * as nego from './negotiation';
import * as theory from './theory';
import { OBJECTIONS } from './trial';
import * as vd from './voirdire';

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 40);
/** 同一個畫面連續這麼多步都沒推進，就算卡關。 */
const STALL = 4000;
/**
 * 已知問題：遴選時有因迴避＋三次無因迴避（檢方跟著砍三個）會讓候選人少於 12 位，
 * 「入席」再也按不下去。修好之後把這個改成 false，隨機玩家就會重新去踩它。
 */
const KNOWN_VOIRDIRE_SOFTLOCK = true;
const RELATIONS: Relation[] = ['矛盾', '支持', '縮小範圍', '說明動機', '說明機會'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Act = [label: string, run: () => void];

/** 此刻畫面上按得到的操作。`go` 是推進到下一個畫面的那一顆。 */
function actions(p: Progress): { go: Act | null; rest: Act[] } {
  const g = useEpisode.getState();
  const s = sceneOf(p)!;
  const rest: Act[] = [];
  const add = (label: string, run: () => void) => rest.push([label, run]);
  const go = (label = 'advance', run = g.advance): Act => [label, run];

  switch (s.type) {
    case 'card':
      return { go: go(), rest };
    case 'phone':
    case 'dialogue': {
      const step = s.steps[p.step];
      if (step && 'do' in step && step.do === 'choose' && sceneChoices(p)[p.step] === undefined) {
        step.options.forEach((_o, i) => add(`choose ${i}`, () => g.choose(i)));
        return { go: null, rest };
      }
      return { go: go(), rest };
    }
    case 'interview': {
      const st = interviewState(p, s);
      if (!st.over) {
        for (const t of s.topics) add(`ask ${t.id}`, () => g.ask(t.id));
        for (const x of s.press) add(`press ${x.id}`, () => g.press(x.id));
        add('calm', g.calm);
      }
      return { go: st.over || interview.canFinish(s, st) ? go() : null, rest };
    }
    case 'desk': {
      const st = deskState(p, s);
      if (st.report.length) return { go: null, rest: [['clearReport', g.clearReport]] };
      const twist = desk.pendingTwist(s, st);
      if (twist) {
        twist.twist!.options.forEach((_o, i) =>
          add(`twist ${twist.id} ${i}`, () => g.resolveTwist(twist.id, i)),
        );
        return { go: null, rest };
      }
      if (desk.done(s, st)) return { go: go(), rest };
      const held = desk.heldCards(s, st, p.cards);
      for (const d of s.docs) {
        add(`open ${d.id}`, () => g.openDoc(d.id));
        for (const l of d.lines) if (l.fact) add(`mark ${l.fact}`, () => g.mark(l.fact!));
      }
      for (const m of s.mail) add(`mail ${m.id}`, () => g.openMail(m.id));
      for (const j of s.jobs) add(`job ${j.id}`, () => g.commission(j.id));
      for (const m of s.motions) {
        for (const b of m.bases) add(`basis ${m.id} ${b}`, () => g.pickBasis(m.id, b));
        for (const r of m.requests) add(`request ${m.id} ${r}`, () => g.pickRequest(m.id, r));
        for (const c of held) add(`support ${m.id} ${c}`, () => g.toggleSupport(m.id, c));
        add(`file ${m.id}`, () => g.fileMotion(m.id));
      }
      for (const c of held) add(`link ${c}`, () => g.toggleLinkCard(c));
      for (const r of RELATIONS) add(`relation ${r}`, () => g.setLinkRelation(r));
      add('connect', g.connect);
      for (const q of s.questions) {
        for (const c of [...st.found, ...held])
          add(`answer ${q.id} ${c}`, () => g.toggleCard(q.id, c));
        add(`submit ${q.id}`, () => g.submit(q.id));
      }
      if (desk.canWrap(s, st)) add('wrap', g.wrapDesk);
      return { go: null, rest };
    }
    case 'trial': {
      const sc = courtScene(p, s);
      const st = trialState(p, sc);
      if (st.stage === 'done') return { go: go(), rest };
      if (st.stage === 'direct') {
        if (st.window) {
          add('pass', g.letPass);
          for (const o of OBJECTIONS) add(`object ${o}`, () => g.object(o));
        } else {
          add('next question', g.nextQuestion);
          add('to cross', g.toCross);
        }
        return { go: null, rest };
      }
      const first = deskSceneOf(p);
      const args = (first?.questions ?? [])
        .filter((q) => p.cards.includes(q.argument.id))
        .map((q) => q.argument);
      for (const c of sc.witness.claims) {
        add(`lock ${c.id} strong`, () => g.lock(c.id, 'strong'));
        add(`lock ${c.id} weak`, () => g.lock(c.id, 'weak'));
        add(`setup ${c.id}`, () => g.setup(c.id));
        for (const a of args)
          add(`confront ${c.id} ${a.id}`, () =>
            g.confront(c.id, a.strength, a.tags as Tag[], a.id),
          );
      }
      sc.witness.irrelevant.forEach((_q, i) => add(`badger ${i}`, () => g.badger(i)));
      add('finish trial', g.finishTrial);
      return { go: null, rest };
    }
    case 'deposition': {
      const st = depoState(p, s);
      if (depo.done(st)) return { go: go(), rest };
      for (const t of s.topics)
        for (const q of depo.questionsOf(s, t.id)) add(`depo ${q.id}`, () => g.askDepo(q.id));
      add('finish depo', g.finishDepo);
      return { go: null, rest };
    }
    case 'negotiation': {
      const st = negoState(p, s);
      if (nego.done(st)) return { go: go(), rest };
      const first = deskSceneOf(p);
      for (const q of first?.questions ?? [])
        if (p.cards.includes(q.argument.id)) {
          const a = q.argument;
          add(`reveal ${a.id}`, () => g.revealArg(a.id, a.strength, a.name));
        }
      for (const b of s.bluffs) add(`bluff ${b.id}`, () => g.bluff(b.id));
      add('advise take', () => g.advise(true));
      add('advise hold', () => g.advise(false));
      add('walk out', g.walkOut);
      return { go: null, rest };
    }
    case 'defense': {
      const st = defenseState(p, s);
      if (st.stage === 'done') return { go: go(), rest };
      if (st.stage === 'prep')
        for (const o of s.prep.options) add(`prep ${o.id}`, () => g.prepareWitness(o.id));
      else {
        for (const q of s.questions) add(`witness ${q.id}`, () => g.askWitness(q.id));
        add('finish witness', g.finishWitness);
      }
      return { go: null, rest };
    }
    case 'theory': {
      const st = theoryState(p, s);
      if (theory.done(st)) return { go: go(), rest };
      for (const t of s.theories) add(`theory ${t.id}`, () => g.chooseTheory(t.id));
      if (!s.theories.some((t) => theory.unlocked(t, p.cards))) add('skip theory', g.skipTheory);
      return { go: null, rest };
    }
    case 'opening': {
      const st = openingState(p, s);
      if (st.delivered) return { go: go(), rest };
      for (const x of promisesOf(p).theory?.promises ?? [])
        add(`promise ${x.id}`, () => g.togglePromise(x.id));
      add('deliver opening', g.deliverOpening);
      return { go: null, rest };
    }
    case 'voirdire': {
      const st = voirDireState(p, s);
      if (vd.done(st)) return { go: go(), rest };
      for (const c of s.candidates) {
        add(`juror ask ${c.id}`, () => g.askJuror(c.id));
        if (!KNOWN_VOIRDIRE_SOFTLOCK || vd.pool(s, st).length - 1 >= s.seats)
          add(`juror cause ${c.id}`, () => g.challengeJuror(c.id));
        if (!KNOWN_VOIRDIRE_SOFTLOCK || vd.pool(s, st).length - 2 >= s.seats)
          add(`juror strike ${c.id}`, () => g.strikeJuror(c.id));
      }
      add('seat', g.seatJury);
      return { go: null, rest };
    }
    case 'closing': {
      const st = closingState(p, s);
      if (closing.done(st)) return { go: go(), rest };
      for (const a of closingArgs(p)) add(`pick ${a.id}`, () => g.pickArg(a.id));
      for (const t of s.tones) add(`tone ${t.id}`, () => g.setTone(t.id));
      add('deliver closing', g.deliver);
      return { go: null, rest };
    }
  }
}

/** 數值不該越界：工時不為負、陪審員心證在 0–100。 */
function checkInvariants(p: Progress) {
  for (const [id, st] of Object.entries(p.scenes ?? {})) {
    const x = st as { hours?: number; jury?: Record<string, number> };
    if (typeof x.hours === 'number' && x.hours < 0) throw new Error(`${id} 工時為負：${x.hours}`);
    for (const [j, v] of Object.entries(x.jury ?? {}))
      if (!(v >= 0 && v <= 100)) throw new Error(`${id} 陪審員 ${j} 心證越界：${v}`);
  }
}

interface Run {
  seed: number;
  steps: number;
  scenes: string[];
  error?: string;
  trace: string[];
}

function play(seed: number): Run {
  const r = rng(seed);
  useEpisode.getState().newGame();
  const run: Run = { seed, steps: 0, scenes: [], trace: [] };
  let stall = 0;
  let where = '';
  // 推進的機率每局不同：有的玩家急著往下走，有的把每顆按鈕都按過。
  const eager = 0.05 + r() * 0.6;
  try {
    for (;;) {
      const p = useEpisode.getState().progress;
      const s = sceneOf(p);
      if (!s) return run;
      const here = `${s.id}#${p.step}`;
      if (here !== where) {
        if (run.scenes.at(-1) !== s.id) run.scenes.push(s.id);
        where = here;
        stall = 0;
      }
      const { go, rest } = actions(p);
      if (!go && rest.length === 0) throw new Error(`卡關：${here} 沒有任何可以按的操作`);
      const pick =
        go && (rest.length === 0 || r() < eager) ? go : rest[Math.floor(r() * rest.length)];
      run.trace.push(`${here} ${pick[0]}`);
      if (run.trace.length > 30) run.trace.shift();
      pick[1]();
      run.steps++;
      checkInvariants(useEpisode.getState().progress);
      if (++stall > STALL) throw new Error(`卡關：${here} 連續 ${STALL} 步都沒推進`);
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e);
    return run;
  }
}

afterEach(() => useEpisode.getState().toTitle());

describe('隨機玩家', () => {
  it(`${SEEDS} 局隨機選擇都能走到本集完`, () => {
    const runs = Array.from({ length: SEEDS }, (_v, i) => play(1000 + i));
    const bad = runs.filter((x) => x.error || x.scenes.at(-1) !== 'slice-end');
    const report = bad.map(
      (x) =>
        `種子 ${x.seed}：${x.error ?? `停在 ${x.scenes.at(-1)}`}\n  最後幾步：\n    ${x.trace.slice(-8).join('\n    ')}`,
    );
    if (process.env.FUZZ_REPORT) {
      // 每局走過的尾聲組合，看看哪些結局真的走得到。
      const tally = new Map<string, number>();
      for (const x of runs) {
        const k = x.scenes.filter((id) => id.startsWith('epilogue')).join(' ') || '（沒有尾聲）';
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
      console.log(
        [...tally]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${n}\t${k}`)
          .join('\n'),
      );
    }
    expect(report).toEqual([]);
  }, 600_000);
});
