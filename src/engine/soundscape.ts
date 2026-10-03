import type { Scene, TrialScene } from './episode/schema';
import type * as closing from './episode/closing';
import type * as desk from './episode/desk';
import type * as trial from './episode/trial';
import { sceneOf, useEpisode, type Mode } from './game';
import type { Progress } from './save';
import { play, setAmbience, setMusic, type Ambience, type Cue, type Music } from './sound';

/**
 * 依遊戲狀態決定放什麼（audio/audio-direction.md §5.3；使用者決定音樂只在庭審、結辯、判決與片尾）：
 * 庭審常態放 mus_court，施壓時（異議窗開著、彈劾進行中、陪審團明顯偏向對方）切到 mus_court_tense，
 * 解除就切回來；結辯放一次 mus_closing；判決出來音樂全抽，只剩法庭環境音。
 */
export interface Soundscape {
  music: Music | null;
  ambience: Ambience | null;
  /** 環境音壓低（結辯時讓位給音樂）。 */
  duck: boolean;
}

const COURT = new Set<Scene['type']>(['voirdire', 'opening', 'trial', 'defense', 'closing']);
const OFFICE = new Set<Scene['type']>(['desk', 'theory', 'interview']);

/** 陪審團平均超過門檻這麼多就算「明顯偏向對方」；回落到 RELEASE 以下才解除，免得來回切。 */
export const PRESSURE = 10;
export const RELEASE = 5;

/** 對白與談判沒有場景類型可依，用 place 的關鍵字對到環境音（place 永遠是中文原文，英文模式也一樣）。 */
export function ambienceOf(place: string): Ambience | null {
  if (/深夜|晚上|夜裡|2[0-3]:\d\d/.test(place)) return 'amb_office_night';
  if (/走廊|台階|大廳|電梯|會見室|門口|街/.test(place)) return null;
  if (/法庭|量刑庭/.test(place)) return 'amb_court';
  if (/事務所|辦公室|會議室|影印|調解室|檢察官|檢察署/.test(place)) return 'amb_office_day';
  return null;
}

const avg = (j: Record<string, number>) => {
  const v = Object.values(j);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

/** 庭審施壓：異議窗開著、某一條主張鋪陳好了還沒對質、或心證明顯偏向對方（tense＝上一刻是否已在施壓，做遲滯）。 */
export function pressured(s: TrialScene, st: trial.TrialState, tense = false): boolean {
  if (st.stage === 'done') return false;
  if (st.window) return true;
  if (st.stage !== 'cross') return false;
  if (Object.values(st.claims).some((c) => c.setup && c.result === 'none')) return true;
  return avg(st.jury) >= s.threshold + (tense ? RELEASE : PRESSURE);
}

export function soundscape(mode: Mode, p: Progress, tense = false): Soundscape {
  const quiet: Soundscape = { music: null, ambience: null, duck: false };
  if (mode !== 'play') return quiet;
  const s = sceneOf(p);
  if (!s) return quiet;
  if (COURT.has(s.type)) {
    const st = p.scenes[s.id];
    if (s.type === 'closing') {
      const verdict = (st as closing.ClosingState | undefined)?.verdict;
      return { music: verdict ? null : 'mus_closing', ambience: 'amb_court', duck: !verdict };
    }
    const hot = s.type === 'trial' && !!st && pressured(s, st as trial.TrialState, tense);
    return { music: hot ? 'mus_court_tense' : 'mus_court', ambience: 'amb_court', duck: false };
  }
  if (OFFICE.has(s.type)) return { ...quiet, ambience: 'amb_office_day' };
  if (s.type === 'dialogue' || s.type === 'negotiation' || s.type === 'deposition')
    return { ...quiet, ambience: ambienceOf(s.place) };
  return quiet;
}

/** 狀態變化帶出來的音效：彈劾成功的低語、法官叫停或判決的法槌、證據板連線與新發現、手機通知。 */
export function cuesBetween(prev: Progress, next: Progress): Cue[] {
  if (prev.episode !== next.episode || prev.scene !== next.scene) {
    // 換場景時只看新場景第一步是不是手機通知。
    const s = sceneOf(next);
    return s?.type === 'phone' && s.steps[next.step]?.do === 'notify' ? ['notify'] : [];
  }
  const s = sceneOf(next);
  if (!s) return [];
  const a = prev.scenes[s.id];
  const b = next.scenes[s.id];
  const out: Cue[] = [];
  if (s.type === 'phone' && next.step !== prev.step && s.steps[next.step]?.do === 'notify')
    out.push('notify');
  if (s.type === 'trial' && a && b) {
    const x = a as trial.TrialState;
    const y = b as trial.TrialState;
    if (y.impeachments > x.impeachments) out.push('murmur');
    if ((y.rebuked && !x.rebuked) || (y.stricken && !x.stricken)) out.push('gavel2');
  }
  if (s.type === 'closing' && (b as closing.ClosingState | undefined)?.verdict)
    if (!(a as closing.ClosingState | undefined)?.verdict) out.push('gavel2');
  if (s.type === 'desk' && a && b) {
    if ((b as desk.DeskState).found.length > (a as desk.DeskState).found.length) out.push('pin');
    else if (next.cards.length > prev.cards.length) out.push('found');
  }
  return out;
}

/** 施壓曲至少放這麼久才切回來：直接詰問每一題都會開一次異議窗，不然兩首會一直來回交叉淡入。 */
export const HOLD = 8000;

let started = false;
let tense = false;
let since = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function apply(mode: Mode, p: Progress) {
  const sc = soundscape(mode, p, tense);
  const now = Date.now();
  if (tense && sc.music === 'mus_court' && now - since < HOLD) {
    // 還沒放夠：先撐著，時間到再看一次當下的狀態。
    timer ??= setTimeout(
      () => {
        timer = null;
        const g = useEpisode.getState();
        apply(g.mode, g.progress);
      },
      HOLD - (now - since),
    );
    sc.music = 'mus_court_tense';
  }
  if (sc.music === 'mus_court_tense' && !tense) since = now;
  tense = sc.music === 'mus_court_tense';
  setMusic(sc.music);
  setAmbience(sc.ambience, sc.duck);
}

/** 解鎖音訊後開始跟著遊戲狀態走（只啟動一次）。 */
export function start() {
  if (started) return;
  started = true;
  const g = useEpisode.getState();
  apply(g.mode, g.progress);
  useEpisode.subscribe((next, prev) => {
    if (next.progress === prev.progress && next.mode === prev.mode) return;
    if (next.mode === 'play' && prev.mode === 'play')
      for (const c of cuesBetween(prev.progress, next.progress)) play(c);
    apply(next.mode, next.progress);
  });
}
