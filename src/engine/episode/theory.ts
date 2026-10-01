import type { OpeningScene, Theory, TheoryScene } from './schema';

export interface TheoryState {
  chosen: string | null;
  /** 手上的論點湊不齊任何理論，玩家只能不帶理論開庭。 */
  skipped: boolean;
}

export interface OpeningState {
  promises: string[];
  delivered: boolean;
}

export const startTheory = (): TheoryState => ({ chosen: null, skipped: false });
export const startOpening = (): OpeningState => ({ promises: [], delivered: false });

/** 論點湊齊才選得了這個理論。 */
export function unlocked(t: Theory, held: string[]): boolean {
  return t.needs.every((n) => held.includes(n));
}

export function choose(s: TheoryScene, st: TheoryState, id: string, held: string[]): TheoryState {
  const t = s.theories.find((x) => x.id === id);
  if (st.chosen || st.skipped || !t || !unlocked(t, held)) return st;
  return { ...st, chosen: id };
}

/** 一個理論都選不了的時候，才允許不帶理論開庭（避免玩家被卡死）。 */
export function skip(s: TheoryScene, st: TheoryState, held: string[]): TheoryState {
  if (st.chosen || st.skipped || s.theories.some((t) => unlocked(t, held))) return st;
  return { ...st, skipped: true };
}

export function done(st: TheoryState): boolean {
  return st.chosen !== null || st.skipped;
}

export function chosenTheory(s: TheoryScene | undefined, st: TheoryState | undefined) {
  return s?.theories.find((t) => t.id === st?.chosen) ?? null;
}

export function togglePromise(
  s: OpeningScene,
  theory: Theory | null,
  st: OpeningState,
  id: string,
): OpeningState {
  if (st.delivered || !theory?.promises.some((p) => p.id === id)) return st;
  if (st.promises.includes(id)) return { ...st, promises: st.promises.filter((x) => x !== id) };
  if (st.promises.length >= s.picks) return st;
  return { ...st, promises: [...st.promises, id] };
}

/** 一個承諾都不許也可以開庭：不許就不會被反噬，也拿不到開場的加分。 */
export function deliver(st: OpeningState): OpeningState {
  return st.delivered ? st : { ...st, delivered: true };
}
