import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cases } from '../content';
import * as board from './board';
import * as cross from './cross';
import { startJury } from './jury';
import type { Argument, Relation, Tag } from './schema';

export type Phase = 'intro' | 'board' | 'court' | 'verdict';

export const episode = cases.proto;

interface GameState {
  phase: Phase;
  board: board.BoardState;
  feedback: Record<string, string>;
  cross: cross.CrossState | null;
  showNumbers: boolean;
  witnessStart: number | null;
  witnessEnd: number | null;
  restart: () => void;
  begin: () => void;
  toggleCard: (qid: string, card: string) => void;
  setRelation: (qid: string, r: Relation) => void;
  submit: (qid: string) => void;
  toggleTimeline: (card: string) => void;
  goToCourt: () => void;
  toggleNumbers: () => void;
  askExpert: (qid: string) => void;
  toWitness: () => void;
  lock: (claim: string, how: 'strong' | 'weak') => void;
  setup: (claim: string) => void;
  irrelevant: (i: number) => void;
  confront: (claim: string, arg: Argument) => void;
  toClosing: () => void;
  closing: (args: Argument[], tone: Tag) => void;
}

const fresh = () => ({
  phase: 'intro' as Phase,
  board: board.startBoard(episode),
  feedback: {},
  cross: null,
  witnessStart: null,
  witnessEnd: null,
});

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      /** 套用詰問動作；離開證人階段時記下詰問時長（原型要驗證的第 5 題）。 */
      const act = (f: (s: cross.CrossState) => cross.CrossState) => {
        const prev = get().cross!;
        const next = f(prev);
        const leftWitness = prev.stage === 'witness' && next.stage !== 'witness';
        set({ cross: next, ...(leftWitness ? { witnessEnd: Date.now() } : {}) });
      };
      return {
        ...fresh(),
        showNumbers: false,
        restart: () => set(fresh()),
        begin: () => set({ phase: 'board' }),
        toggleCard: (qid, card) =>
          set({ board: board.toggleCard(episode, get().board, qid, card) }),
        setRelation: (qid, r) => set({ board: board.setRelation(get().board, qid, r) }),
        submit: (qid) => {
          const r = board.submit(episode, get().board, qid);
          const msg = r.ok
            ? '案情會議通過：這條推理成立，產生論點卡。'
            : '案情會議結論：這條推理站不住。沒有人說得出是哪裡不對。';
          set({ board: r.board, feedback: { ...get().feedback, [qid]: msg } });
        },
        toggleTimeline: (card) => set({ board: board.toggleTimeline(get().board, card) }),
        goToCourt: () =>
          set({ phase: 'court', cross: cross.startCross(episode, startJury(episode)) }),
        toggleNumbers: () => set({ showNumbers: !get().showNumbers }),
        askExpert: (qid) => act((s) => cross.askExpert(episode, s, qid)),
        toWitness: () => {
          act((s) => cross.toWitness(episode, s));
          set({ witnessStart: Date.now() });
        },
        lock: (claim, how) => act((s) => cross.lock(episode, s, claim, how)),
        setup: (claim) => act((s) => cross.setup(episode, s, claim)),
        irrelevant: (i) => act((s) => cross.irrelevant(episode, s, i)),
        confront: (claim, arg) => act((s) => cross.confront(episode, s, claim, arg)),
        toClosing: () => act((s) => cross.toClosing(s)),
        closing: (args, tone) => {
          act((s) => cross.closing(episode, s, args, tone));
          set({ phase: 'verdict' });
        },
      };
    },
    // 存檔結構改變時要把 version 加一並寫 migrate，避免玩家存檔損毀。v1 是舊版原型，直接重來。
    {
      name: 'lawgame-save',
      version: 2,
      migrate: () => ({ ...fresh(), showNumbers: false }) as unknown as GameState,
    },
  ),
);
