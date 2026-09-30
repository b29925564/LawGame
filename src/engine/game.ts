import { create } from 'zustand';
import { episodes } from '../content';
import { canAdvance } from './episode/phone';
import type { Episode, Scene } from './episode/schema';
import { readSave, writeSave, type Progress, type Slot } from './save';

export type Mode = 'title' | 'play' | 'proto';

const start = (episode: string): Progress => ({ episode, scene: 0, step: 0, choices: {} });

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
}

export const useEpisode = create<GameState>()((set, get) => {
  /** 換場時自動存檔。 */
  const nextScene = (p: Progress): Progress => {
    const next = { ...p, scene: p.scene + 1, step: 0 };
    writeSave('auto', saveLabel(next), next);
    return next;
  };
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
      if (s.type === 'phone') {
        if (!canAdvance(s, p.step, sceneChoices(p))) return;
        if (p.step + 1 < s.steps.length) return set({ progress: { ...p, step: p.step + 1 } });
      }
      set({ progress: nextScene(p) });
    },
    choose: (option) => {
      const p = get().progress;
      const s = sceneOf(p);
      if (s?.type !== 'phone') return;
      const step = s.steps[p.step];
      if (step.do !== 'choose' || sceneChoices(p)[p.step] !== undefined) return;
      if (option < 0 || option >= step.options.length) return;
      set({ progress: { ...p, choices: { ...p.choices, [`${s.id}:${p.step}`]: option } } });
    },
    toTitle: () => set({ mode: 'title' }),
    openProto: () => set({ mode: 'proto' }),
  };
});
