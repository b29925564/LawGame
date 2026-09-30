import { create } from 'zustand';
import { episodes } from '../content';
import type { Relation, Tag } from './schema';
import * as desk from './episode/desk';
import * as interview from './episode/interview';
import { canAdvance } from './episode/phone';
import type { DeskScene, Episode, InterviewScene, Scene, TrialScene } from './episode/schema';
import * as trial from './episode/trial';
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

export function trialState(p: Progress, s: TrialScene) {
  return stateOf(p, s, () => trial.startTrial(s));
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
  toggleCard: (qid: string, card: string) => void;
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
  const onTrial = on<TrialScene, trial.TrialState>('trial', trial.startTrial);

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
    toggleCard: (qid, card) => onDesk((s, st) => desk.toggleCard(s, st, qid, card)),
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
    finishTrial: () => onTrial((_s, st) => trial.finish(st)),
  };
});
