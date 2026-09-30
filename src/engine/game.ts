import { create } from 'zustand';
import { episodes } from '../content';
import type { Relation, Tag } from './schema';
import * as depo from './episode/deposition';
import * as desk from './episode/desk';
import * as interview from './episode/interview';
import * as nego from './episode/negotiation';
import { canAdvance } from './episode/phone';
import type {
  DepositionScene,
  DeskScene,
  Episode,
  InterviewScene,
  NegotiationScene,
  Scene,
  TrialScene,
  VoirDireScene,
} from './episode/schema';
import * as trial from './episode/trial';
import * as voirdire from './episode/voirdire';
import { readSave, writeSave, type Progress, type Slot } from './save';

export type Mode = 'title' | 'play' | 'proto';

const start = (episode: string): Progress => ({
  episode,
  scene: 0,
  step: 0,
  choices: {},
  cards: [],
  scenes: {},
});

export function episodeOf(p: Progress): Episode {
  return episodes[p.episode as keyof typeof episodes] ?? episodes.ep1;
}

export function sceneOf(p: Progress): Scene | null {
  return episodeOf(p).scenes[p.scene] ?? null;
}

/** 該場景的選擇，鍵換成步數。 */
export function sceneChoices(p: Progress): Record<number, number> {
  const s = sceneOf(p);
  const out: Record<number, number> = {};
  if (!s) return out;
  for (const [k, v] of Object.entries(p.choices)) {
    const [sid, step] = k.split(':');
    if (sid === s.id) out[Number(step)] = v;
  }
  return out;
}

export function saveLabel(p: Progress): string {
  const e = episodeOf(p);
  const s = sceneOf(p);
  return `第 ${e.number} 集・${s ? s.act : '本集完'}`;
}

/** 場景狀態存在 progress.scenes 裡，沒有就用該場景的起始狀態。 */
function stateOf<T>(p: Progress, s: { id: string }, init: () => T): T {
  return (p.scenes[s.id] as T) ?? init();
}

export function interviewState(p: Progress, s: InterviewScene) {
  return stateOf(p, s, () => interview.startInterview(s));
}
export function deskState(p: Progress, s: DeskScene) {
  return stateOf(p, s, () => desk.startDesk(s));
}
/** 這一集的調查那一幕：法庭要用它的論點定義與工時紀錄。 */
export function deskSceneOf(p: Progress): DeskScene | null {
  return (episodeOf(p).scenes.find((s) => s.type === 'desk') as DeskScene) ?? null;
}

export function voirDireState(p: Progress, s: VoirDireScene) {
  return stateOf(p, s, () => voirdire.startVoirDire(s));
}

/**
 * 開庭時真正上場的法庭：陪審團是遴選留下的 12 位，
 * 法官耐心先扣掉遴選時沒有根據的聲請（企劃書 6.9.1、6.11）。
 */
export function courtScene(p: Progress, s: TrialScene): TrialScene {
  const vd = episodeOf(p).scenes.find((x) => x.type === 'voirdire') as VoirDireScene | undefined;
  const st = vd ? (p.scenes[vd.id] as voirdire.VoirDireState | undefined) : undefined;
  if (!vd || !st?.seated) return s;
  return {
    ...s,
    jurors: voirdire.panel(vd, st),
    patience: Math.max(1, s.patience - st.wrong),
  };
}

export function trialState(p: Progress, s: TrialScene) {
  return stateOf(p, s, () => trial.startTrial(courtScene(p, s)));
}

export function depoState(p: Progress, s: DepositionScene) {
  return stateOf(p, s, () => depo.startDeposition(s));
}

export function negoState(p: Progress, s: NegotiationScene) {
  return stateOf(p, s, () => nego.startNegotiation(s));
}

/** 洩漏出去的論點：談判攤牌過或錄取時問到底牌話題的，庭上衝擊減半（企劃書 6.8）。 */
export function exposedArgs(p: Progress): string[] {
  const e = episodeOf(p);
  const out: string[] = [];
  for (const s of e.scenes) {
    const st = p.scenes[s.id];
    if (!st) continue;
    if (s.type === 'deposition') out.push(...(st as depo.DepoState).exposed);
    if (s.type === 'negotiation') out.push(...(st as nego.NegoState).exposed);
  }
  return [...new Set(out)];
}

/** 錄取時已經定錨的說法，開庭時可以跳過鎖定那一步（企劃書 6.9.4）。 */
export function anchoredClaims(p: Progress): string[] {
  const e = episodeOf(p);
  return e.scenes.flatMap((s) =>
    s.type === 'deposition' ? ((p.scenes[s.id] as depo.DepoState)?.anchored ?? []) : [],
  );
}

interface GameState {
  mode: Mode;
  progress: Progress;
  newGame: () => void;
  load: (slot: Slot) => boolean;
  save: (slot: Slot) => boolean;
  advance: () => void;
  choose: (option: number) => void;
  toTitle: () => void;
  openProto: () => void;
  /** 訪談 */
  ask: (topic: string) => void;
  press: (id: string) => void;
  calm: () => void;
  /** 桌面 */
  openDoc: (id: string) => void;
  openMail: (id: string) => void;
  mark: (fact: string) => void;
  commission: (id: string) => void;
  clearReport: () => void;
  pickBasis: (motion: string, basis: string) => void;
  pickRequest: (motion: string, request: string) => void;
  toggleSupport: (motion: string, card: string) => void;
  fileMotion: (motion: string) => void;
  resolveTwist: (motion: string, option: number) => void;
  wrapDesk: () => void;
  toggleCard: (qid: string, card: string) => void;
  toggleTimeline: (card: string) => void;
  moveTimeline: (card: string, dir: -1 | 1) => void;
  setRelation: (qid: string, r: Relation) => void;
  submit: (qid: string) => void;
  /** 法庭 */
  nextQuestion: () => void;
  letPass: () => void;
  object: (reason: trial.Objection) => void;
  toCross: () => void;
  lock: (claim: string, how: 'strong' | 'weak') => void;
  setup: (claim: string) => void;
  confront: (claim: string, strength: number, tags: Tag[]) => void;
  badger: (i: number) => void;
  finishTrial: () => void;
  /** 陪審團遴選 */
  askJuror: (id: string) => void;
  challengeJuror: (id: string) => void;
  strikeJuror: (id: string) => void;
  seatJury: () => void;
  /** 證詞錄取 */
  askDepo: (question: string) => void;
  finishDepo: () => void;
  /** 談判 */
  revealArg: (id: string, strength: number, name: string) => void;
  bluff: (id: string) => void;
  advise: (take: boolean) => void;
  walkOut: () => void;
}

export const useEpisode = create<GameState>()((set, get) => {
  /** 換場時自動存檔。 */
  const nextScene = (p: Progress): Progress => {
    const next = { ...p, scene: p.scene + 1, step: 0 };
    writeSave('auto', saveLabel(next), next);
    return next;
  };

  /** 套用一個場景動作，並把該場景的狀態寫回進度。 */
  const on =
    <S extends Scene, T>(type: S['type'], init: (s: S) => T) =>
    (f: (s: S, st: T) => T, carry?: (s: S, st: T) => string[]) => {
      const p = get().progress;
      const s = sceneOf(p) as S | null;
      if (!s || s.type !== type) return;
      const st = f(
        s,
        stateOf(p, s, () => init(s)),
      );
      const cards = carry ? [...new Set([...p.cards, ...carry(s, st)])] : p.cards;
      set({ progress: { ...p, cards, scenes: { ...p.scenes, [s.id]: st } } });
    };

  const onInterview = on<InterviewScene, interview.InterviewState>(
    'interview',
    interview.startInterview,
  );
  const onDesk = on<DeskScene, desk.DeskState>('desk', desk.startDesk);
  const onTrial = on<TrialScene, trial.TrialState>('trial', (s) =>
    trial.startTrial(courtScene(get().progress, s)),
  );
  const onVoirDire = on<VoirDireScene, voirdire.VoirDireState>('voirdire', voirdire.startVoirDire);
  const onDepo = on<DepositionScene, depo.DepoState>('deposition', depo.startDeposition);
  const onNego = on<NegotiationScene, nego.NegoState>('negotiation', nego.startNegotiation);

  return {
    mode: 'title',
    progress: start('ep1'),
    newGame: () => set({ mode: 'play', progress: start('ep1') }),
    load: (slot) => {
      const f = readSave(slot);
      if (!f) return false;
      set({ mode: 'play', progress: f.progress });
      return true;
    },
    save: (slot) => writeSave(slot, saveLabel(get().progress), get().progress),
    advance: () => {
      const p = get().progress;
      const s = sceneOf(p);
      if (!s) return;
      if (s.type === 'phone' || s.type === 'dialogue') {
        if (s.type === 'phone' && !canAdvance(s, p.step, sceneChoices(p))) return;
        if (s.type === 'dialogue') {
          const step = s.steps[p.step];
          if (step?.do === 'choose' && sceneChoices(p)[p.step] === undefined) return;
        }
        if (p.step + 1 < s.steps.length) return set({ progress: { ...p, step: p.step + 1 } });
      }
      set({ progress: nextScene(p) });
    },
    choose: (option) => {
      const p = get().progress;
      const s = sceneOf(p);
      if (s?.type !== 'phone' && s?.type !== 'dialogue') return;
      const step = s.steps[p.step];
      if (step?.do !== 'choose' || sceneChoices(p)[p.step] !== undefined) return;
      if (option < 0 || option >= step.options.length) return;
      set({ progress: { ...p, choices: { ...p.choices, [`${s.id}:${p.step}`]: option } } });
    },
    toTitle: () => set({ mode: 'title' }),
    openProto: () => set({ mode: 'proto' }),

    ask: (topic) =>
      onInterview(
        (s, st) => interview.ask(s, st, topic),
        (_s, st) => st.gained,
      ),
    press: (pid) =>
      onInterview(
        (s, st) => interview.press(s, st, pid, get().progress.cards),
        (_s, st) => st.gained,
      ),
    calm: () => onInterview((s, st) => interview.calm(s, st)),

    openDoc: (docId) => onDesk((_s, st) => desk.openDoc(st, docId)),
    openMail: (mailId) => onDesk((_s, st) => desk.openMail(st, mailId)),
    mark: (fact) =>
      onDesk(
        (s, st) => desk.mark(s, st, fact),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),
    commission: (jid) =>
      onDesk(
        (s, st) => desk.commission(s, st, jid, get().progress.cards),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),
    clearReport: () => onDesk((_s, st) => desk.clearReport(st)),
    pickBasis: (m, basis) => onDesk((_s, st) => desk.pickBasis(st, m, basis)),
    pickRequest: (m, request) => onDesk((_s, st) => desk.pickRequest(st, m, request)),
    toggleSupport: (m, card) => onDesk((s, st) => desk.toggleSupport(s, st, m, card)),
    fileMotion: (m) =>
      onDesk(
        (s, st) => desk.file(s, st, m, get().progress.cards),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),
    resolveTwist: (m, option) =>
      onDesk(
        (s, st) => desk.resolveTwist(s, st, m, option),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),
    wrapDesk: () => onDesk((_s, st) => desk.wrap(st)),
    toggleCard: (qid, card) => onDesk((s, st) => desk.toggleCard(s, st, qid, card)),
    toggleTimeline: (card) => onDesk((_s, st) => desk.toggleTimeline(st, card)),
    moveTimeline: (card, dir) => onDesk((_s, st) => desk.moveTimeline(st, card, dir)),
    setRelation: (qid, r) => onDesk((_s, st) => desk.setRelation(st, qid, r)),
    submit: (qid) =>
      onDesk(
        (s, st) => desk.submit(s, st, qid),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),

    nextQuestion: () => onTrial((s, st) => trial.nextQuestion(s, st)),
    letPass: () => onTrial((s, st) => trial.letPass(s, st)),
    object: (reason) => onTrial((s, st) => trial.object(s, st, reason)),
    toCross: () => onTrial((s, st) => trial.toCross(s, st)),
    lock: (claim, how) => onTrial((s, st) => trial.lock(s, st, claim, how)),
    setup: (claim) => onTrial((s, st) => trial.setup(s, st, claim)),
    confront: (claim, strength, tags) =>
      onTrial((s, st) => trial.confront(s, st, claim, strength, tags)),
    badger: (i) => onTrial((s, st) => trial.badger(s, st, i)),
    askJuror: (id) => onVoirDire((s, st) => voirdire.ask(s, st, id)),
    challengeJuror: (id) => onVoirDire((s, st) => voirdire.challenge(s, st, id)),
    strikeJuror: (id) => onVoirDire((s, st) => voirdire.strike(s, st, id)),
    seatJury: () => onVoirDire((s, st) => voirdire.seat(s, st)),

    askDepo: (q) =>
      onDepo(
        (s, st) => depo.ask(s, st, q),
        (_s, st) => st.gained,
      ),
    finishDepo: () => onDepo((_s, st) => depo.finish(st)),

    revealArg: (id, strength, name) => onNego((s, st) => nego.reveal(s, st, id, strength, name)),
    bluff: (id) => onNego((s, st) => nego.bluff(s, st, id)),
    advise: (take) => onNego((s, st) => nego.advise(s, st, take)),
    walkOut: () => onNego((s, st) => nego.walk(s, st)),

    finishTrial: () => onTrial((_s, st) => trial.finish(st)),
  };
});
