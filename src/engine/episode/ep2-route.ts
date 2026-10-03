/**
 * 第 2 集的「實玩路線」：從選理論開始，經過遴選、開場、三場庭審、崔佛、結辯，
 * 全部透過遊戲的 store 操作（和畫面上按按鈕一樣），所以審前動議、硬藏、遴選、
 * 開場承諾、評議的效果都會算進去。平衡測試用它，免得模擬和實際遊玩對不上
 * （體驗評測 2026-10-03：測試說會輸的路線，實玩贏了）。
 *
 * 只給測試用；審前的狀態（開示怎麼回、動議准不准、筆錄更不更正）直接寫進存檔。
 */
import { episodes } from '../../content';
import {
  closingArgs,
  courtScene,
  deskScene,
  promisesOf,
  sceneOf,
  trialState,
  useEpisode,
  voirDireState,
} from '../game';
import type { Progress } from '../save';
import type { Tag } from '../schema';
import * as desk from './desk';
import * as discovery from './discovery';
import type { ClosingState } from './closing';
import type { DeskScene, VoirDireScene } from './schema';
import * as trial from './trial';

export interface Ep2Route {
  theory: 'own-choice' | 'warned' | 'shared';
  /** 群組截圖：交出或硬藏。 */
  chat?: 'produce' | 'conceal';
  /** 請崔佛更正錄取筆錄（勘誤）。 */
  corrected?: boolean;
  /** 審前聲請排除費雪准了。 */
  daubert?: boolean;
  /** 庭上問了被教過的那一題（讓崔佛再說一次「一直都是提醒」）。 */
  always?: boolean;
  coach?: boolean;
  /** 庭審：異議全對、每個主張都對質。 */
  object?: boolean;
  confront?: boolean;
  /** 遴選：問過的人有偏見就有因迴避，無因迴避砍掉起始心證最高的兩位。 */
  voir?: boolean;
  /** 遴選時用無因迴避砍掉的候選人（給了就不照 voir 的預設做法）。 */
  strikes?: string[];
  /** 結辯的基調。 */
  tone?: string;
}

const ep = episodes.ep2;
const args = ep.scenes
  .filter((s): s is DeskScene => s.type === 'desk')
  .flatMap((d) => d.questions.map((q) => q.argument));
const at = (id: string) => ep.scenes.findIndex((s) => s.id === id);

/** 審前結束、要選理論時的存檔。 */
export function beforeTheory(r: Ep2Route): Progress {
  const flags: string[] = [];
  const base: Progress = {
    episode: 'ep2',
    scene: at('theory'),
    step: 0,
    choices: {},
    cards: [...args.map((a) => a.id), 'app-log', ...(r.corrected ? ['errata'] : [])],
    flags,
    ethics: r.chat === 'conceal' ? [discovery.CONCEALED] : [],
    scenes: {},
  };
  const inv = deskScene(base, ep.scenes[at('investigate')] as DeskScene);
  let st: desk.DeskState = { ...desk.startDesk(inv), hours: 99 };
  for (const q of inv.discovery) {
    // 沒給 chat：玩家沒找到舊版規格書，這一項請求根本沒出現。
    if (q.id === 'rq-chat' && !r.chat) continue;
    const resp = q.id === 'rq-chat' && r.chat === 'conceal' ? 'privilege' : 'produce';
    const result = discovery.resultOf(q, resp);
    st = {
      ...st,
      discovery: { ...st.discovery, [q.id]: result },
      flags: [...st.flags, `discovery:${q.id}:${result}`],
    };
  }
  const pre = ep.scenes[at('pretrial')] as DeskScene;
  let ps: desk.DeskState = { ...desk.startDesk(pre), hours: 99 };
  if (r.daubert) {
    const m = pre.motions.find((x) => x.id === 'm-daubert')!;
    ps = {
      ...ps,
      motions: {
        [m.id]: {
          basis: m.basis,
          request: m.request,
          support: m.support,
          ruling: 'granted',
          twist: null,
        },
      },
      flags: [...m.flags],
    };
  }
  if (r.corrected) ps = { ...ps, flags: [...ps.flags, 'trevor-corrected'] };
  return { ...base, scenes: { investigate: st, pretrial: ps } };
}

export interface Ep2Result {
  verdict: string | undefined;
  /** 庭審結束、結辯講完、評議之後，倒向對方（≥ 門檻）的人數。 */
  afterTrial: number;
  afterClosing: number;
  afterDeliberation: number;
  progress: Progress;
}

/** 從選理論一路玩到判決。 */
export function playEp2(r: Ep2Route): Ep2Result {
  const g = () => useEpisode.getState();
  g().newGame('ep2');
  useEpisode.setState({ progress: beforeTheory(r) });
  const p = () => g().progress;
  let afterTrial = -1;
  for (let guard = 0; guard < 2000; guard++) {
    const s = sceneOf(p());
    if (!s || s.type === 'dialogue' || s.type === 'phone') break;
    switch (s.type) {
      case 'card':
        g().advance();
        break;
      case 'theory':
        g().chooseTheory(r.theory);
        g().advance();
        break;
      case 'voirdire': {
        const vd = s as VoirDireScene;
        for (const id of r.strikes ?? []) g().strikeJuror(id);
        if (r.voir && !r.strikes) {
          const top = [...vd.candidates].sort((a, b) => b.start - a.start);
          for (const c of top.slice(0, vd.questions)) g().askJuror(c.id);
          for (const c of top) if (c.cause) g().challengeJuror(c.id);
          for (const c of top) {
            const st = voirDireState(p(), vd);
            if (st.struck.length >= vd.peremptories) break;
            if (![...st.excused, ...st.theirs].includes(c.id)) g().strikeJuror(c.id);
          }
        }
        g().seatJury();
        g().advance();
        break;
      }
      case 'opening': {
        for (const x of (promisesOf(p()).theory?.promises ?? []).slice(0, 2))
          g().togglePromise(x.id);
        g().deliverOpening();
        g().advance();
        break;
      }
      case 'trial': {
        const sc = courtScene(p(), s);
        for (let i = 0; i < 200 && trialState(p(), sc).stage === 'direct'; i++) {
          const st = trialState(p(), sc);
          if (st.window) {
            const q = sc.witness.direct[st.i];
            if (r.object && q?.objection) g().object(q.objection as trial.Objection);
            else g().letPass();
          } else g().nextQuestion();
        }
        if (r.confront)
          for (const c of sc.witness.claims) {
            const a = args.find((x) => x.id === c.argument);
            if (!a) continue;
            g().lock(c.id, 'strong');
            g().setup(c.id);
            g().confront(c.id, a.strength, a.tags as Tag[], a.id);
          }
        if (trialState(p(), sc).stage !== 'done') g().finishTrial();
        g().advance();
        break;
      }
      case 'defense': {
        g().prepareWitness(r.coach ? 'trevor-coach' : 'trevor-honest');
        for (const q of s.questions) if (q.id !== 'tq-always' || r.always) g().askWitness(q.id);
        g().finishWitness();
        afterTrial = leaning(p());
        g().advance();
        break;
      }
      case 'closing': {
        const th = promisesOf(p()).theory;
        const picks =
          th?.needs ??
          closingArgs(p())
            .slice(0, s.picks)
            .map((a) => a.id);
        for (const id of picks) g().pickArg(id);
        g().setTone(r.tone ?? 't-logic');
        g().deliver();
        const cs = p().scenes[s.id] as ClosingState & { verdict?: string };
        const rules = courtScene(p(), ep.scenes[lastTrial(p())] as never);
        const count = (j: Record<string, number> | null | undefined) =>
          Object.values(j ?? {}).filter((v) => v >= rules.threshold).length;
        return {
          verdict: cs.verdict,
          afterTrial,
          afterClosing: count(cs.spoken),
          afterDeliberation: count(cs.jury),
          progress: p(),
        };
      }
      default:
        g().advance();
    }
  }
  throw new Error(`沒走到結辯：停在 ${sceneOf(p())?.id}`);
}

function lastTrial(p: Progress) {
  const scenes = ep.scenes;
  return scenes.reduce((n, x, i) => (x.type === 'trial' && p.scenes[x.id] ? i : n), -1);
}

function leaning(p: Progress) {
  const s = ep.scenes[at('defense-trevor')];
  const st = p.scenes[s.id] as { jury?: Record<string, number> } | undefined;
  const rules = courtScene(p, ep.scenes[lastTrial(p)] as never);
  return Object.values(st?.jury ?? {}).filter((v) => v >= rules.threshold).length;
}
