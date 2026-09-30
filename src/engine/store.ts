import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cases } from '../content';
import type { AppId } from './schema';
import * as trial from './trial';

export type Phase = 'title' | 'incident' | 'desk' | 'trial' | 'verdict';

interface GameState {
  phase: Phase;
  line: number;
  app: AppId | null;
  doc: string | null;
  collected: string[];
  trial: trial.TrialState;
  won: boolean;
  newGame: () => void;
  nextLine: () => void;
  openApp: (app: AppId | null) => void;
  openDoc: (doc: string | null) => void;
  collect: (evidenceId: string) => void;
  goToTrial: () => void;
  backToDesk: () => void;
  move: (delta: number) => void;
  press: () => void;
  present: (evidenceId: string) => void;
}

export const episode = cases.ep1;

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      phase: 'title',
      line: 0,
      app: null,
      doc: null,
      collected: [],
      trial: trial.startTrial(episode),
      won: false,
      newGame: () =>
        set({
          phase: 'incident',
          line: 0,
          app: null,
          doc: null,
          collected: [],
          trial: trial.startTrial(episode),
          won: false,
        }),
      nextLine: () => {
        const line = get().line + 1;
        set(line < episode.incident.length ? { line } : { phase: 'desk' });
      },
      openApp: (app) => set({ app, doc: null }),
      openDoc: (doc) => set({ doc }),
      collect: (id) => {
        if (!get().collected.includes(id)) set({ collected: [...get().collected, id] });
      },
      goToTrial: () => set({ phase: 'trial', trial: trial.startTrial(episode) }),
      backToDesk: () => set({ phase: 'desk' }),
      move: (delta) => set({ trial: trial.move(episode, get().trial, delta) }),
      press: () => set({ trial: trial.press(episode, get().trial) }),
      present: (id) => {
        const t = trial.present(episode, get().trial, id);
        const result = trial.outcome(episode, t);
        set({
          trial: t,
          ...(result === 'ongoing' ? {} : { phase: 'verdict', won: result === 'win' }),
        });
      },
    }),
    // 存檔結構改變時要把 version 加一並寫 migrate，避免玩家存檔損毀。
    { name: 'lawgame-save', version: 1 },
  ),
);
