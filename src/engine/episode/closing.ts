import { applyImpact, deliberate, verdict, type Jury, type JuryRules, type Round } from '../jury';
import type { Tag } from '../schema';
import type { ClosingScene, Question } from './schema';

export interface ClosingState {
  /** 挑出來的論點，順序就是講的順序。 */
  picked: string[];
  tone: string | null;
  jury: Jury;
  /** 結辯講完、評議之前的心證：畫面上要看得到這一段話說動了誰。 */
  spoken: Jury | null;
  deltas: Jury;
  rounds: Round[];
  verdict: '無罪' | '有罪' | '陪審團僵局' | null;
}

/** 結辯重述已經呈現過的論點，力道打對折（企劃書 6.9.8 的近因效應仍然疊在上面）。 */
const RECAP = 0.25;

export function startClosing(jury: Jury): ClosingState {
  return { picked: [], tone: null, jury, spoken: null, deltas: {}, rounds: [], verdict: null };
}

export function togglePick(s: ClosingScene, st: ClosingState, id: string): ClosingState {
  if (st.verdict) return st;
  if (st.picked.includes(id)) return { ...st, picked: st.picked.filter((x) => x !== id) };
  if (st.picked.length >= s.picks) return st;
  return { ...st, picked: [...st.picked, id] };
}

export function setTone(s: ClosingScene, st: ClosingState, tone: string): ClosingState {
  if (st.verdict || !s.tones.some((t) => t.id === tone)) return st;
  return { ...st, tone };
}

export function canDeliver(s: ClosingScene, st: ClosingState): boolean {
  return !st.verdict && st.tone !== null && st.picked.length === s.picks;
}

/**
 * 結辯：論點依序施加衝擊，最後一個 ×1.3（近因效應），
 * 基調說中陪審員取向的另外加成。接著三輪評議，然後判決。
 */
export function deliver(
  s: ClosingScene,
  st: ClosingState,
  rules: JuryRules,
  args: Question['argument'][],
  exposed: string[] = [],
): ClosingState {
  if (!canDeliver(s, st)) return st;
  const tone = s.tones.find((t) => t.id === st.tone)!;
  let jury = st.jury;
  st.picked.forEach((id, i) => {
    const a = args.find((x) => x.id === id);
    if (!a) return;
    const last = i === st.picked.length - 1;
    // 洩漏過的論點，對方在庭上已經打過預防針，結辯再講一次也只剩一半。
    // 結辯是提醒，不是新證據：陪審團已經在庭上聽過一次，所以只有一半的力道。
    const modifier = RECAP * (last ? 1.3 : 1) * (exposed.includes(id) ? 0.5 : 1);
    jury = applyImpact(rules, jury, a.strength, [...a.tags, tone.tag] as Tag[], modifier).jury;
  });
  const rounds = deliberate(rules, jury);
  const final = rounds[rounds.length - 1].jury;
  return { ...st, jury: final, spoken: jury, rounds, verdict: verdict(rules, final) };
}

export function done(st: ClosingState): boolean {
  return st.verdict !== null;
}
