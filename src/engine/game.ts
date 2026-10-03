import { create } from 'zustand';
import { episodes } from '../content';
import type { Relation, Tag } from './schema';
import * as branch from './episode/branch';
import * as closing from './episode/closing';
import * as defense from './episode/defense';
import * as depo from './episode/deposition';
import * as discovery from './episode/discovery';
import * as desk from './episode/desk';
import * as interview from './episode/interview';
import * as nego from './episode/negotiation';
import { canAdvance } from './episode/phone';
import type {
  DefenseScene,
  DepositionScene,
  DeskScene,
  Episode,
  InterviewScene,
  ClosingScene,
  NegotiationScene,
  OpeningScene,
  Scene,
  TheoryScene,
  TrialScene,
  VoirDireScene,
  When,
} from './episode/schema';
import * as theory from './episode/theory';
import * as trial from './episode/trial';
import * as voirdire from './episode/voirdire';
import { shiftAll } from './jury';
import { readSave, writeSave, type Progress, type Slot } from './save';

export type Mode = 'title' | 'play' | 'proto';

const start = (episode: string): Progress => ({
  episode,
  scene: 0,
  step: 0,
  choices: {},
  cards: [],
  flags: [],
  ethics: [],
  scenes: {},
});

/** 集數順序（content/index.ts 的登錄順序）。 */
const ORDER = Object.keys(episodes);

/** 這一集之後的下一集；最後一集回傳 null。 */
export function followingEpisode(p: Progress): string | null {
  return ORDER[ORDER.indexOf(p.episode) + 1] ?? null;
}

/**
 * 接續下一集：對話旗標與倫理紀錄跨集帶著走，這一集的結果寫成
 * <集>:verdict:<判決>、<集>:outcome:<結果>、<集>:deal:<條件>、<集>:theory:<理論> 旗標。
 * 場景內的旗標（動議、開示、請示電話）只屬於那一集，不帶；集層級 effects 算出來的旗標會帶。
 */
export function carryOver(p: Progress, next: string): Progress {
  const c = branchContext(p);
  const summary = [
    c.verdict && `verdict:${c.verdict}`,
    c.outcome && `outcome:${c.outcome}`,
    c.deal && `deal:${c.deal}`,
    c.theory && `theory:${c.theory}`,
  ]
    .filter((x): x is string => !!x)
    .map((x) => `${p.episode}:${x}`);
  const effects = effectFlags(p, allFlags(p));
  return {
    ...start(next),
    flags: [...new Set([...(p.flags ?? []), ...effects, ...summary])],
    ethics: [...(p.ethics ?? [])],
  };
}

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

/** 對話選項記下的旗標。 */
export const hasFlag = (p: Progress, flag: string) => (p.flags ?? []).includes(flag);

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

/**
 * 結辯接的是上一場庭審（或辯方證人）留下的心證，不是重新開始（企劃書 6.10）。
 * 規則（陪審員名單）一律用遴選留下的那一份。
 */
export function juryAfterTrial(
  p: Progress,
): { rules: TrialScene; jury: Record<string, number> } | null {
  const scenes = episodeOf(p).scenes;
  const trials = scenes.filter((x) => x.type === 'trial') as TrialScene[];
  const lastTrial = [...trials].reverse().find((t) => p.scenes[t.id]);
  if (!lastTrial) return null;
  // 庭審之後的辯方證人場景也會改動心證，取順序最後、已經有狀態的那一個。
  let jury = (p.scenes[lastTrial.id] as trial.TrialState).jury;
  let at = scenes.indexOf(lastTrial);
  scenes.forEach((x, i) => {
    const st = p.scenes[x.id] as { jury?: Record<string, number> } | undefined;
    if (x.type === 'defense' && st?.jury && i > at) {
      jury = st.jury;
      at = i;
    }
  });
  return { rules: courtScene(p, lastTrial), jury };
}

export function defenseState(p: Progress, s: DefenseScene) {
  return stateOf(p, s, () => defense.startDefense(juryAfterTrial(p)?.jury ?? {}));
}

export function theorySceneOf(p: Progress): TheoryScene | undefined {
  return episodeOf(p).scenes.find((x) => x.type === 'theory') as TheoryScene | undefined;
}
export function openingSceneOf(p: Progress): OpeningScene | undefined {
  return episodeOf(p).scenes.find((x) => x.type === 'opening') as OpeningScene | undefined;
}
export function theoryState(p: Progress, s: TheoryScene) {
  return stateOf(p, s, () => theory.startTheory());
}
export function openingState(p: Progress, s: OpeningScene) {
  return stateOf(p, s, () => theory.startOpening());
}

/** 選定的案件理論，以及開場許下的承諾（連同它要用哪個論點兌現）。 */
export function promisesOf(p: Progress) {
  const ts = theorySceneOf(p);
  const os = openingSceneOf(p);
  const t = ts ? theory.chosenTheory(ts, p.scenes[ts.id] as theory.TheoryState | undefined) : null;
  const picked = os ? ((p.scenes[os.id] as theory.OpeningState | undefined)?.promises ?? []) : [];
  return {
    theory: t,
    opening: os,
    promises: (t?.promises ?? []).filter((x) => picked.includes(x.id)),
  };
}

/** 庭上已經兌現的承諾。 */
export function keptPromises(p: Progress): string[] {
  const out: string[] = [];
  for (const s of episodeOf(p).scenes)
    if (s.type === 'trial')
      out.push(...((p.scenes[s.id] as trial.TrialState | undefined)?.kept ?? []));
  return [...new Set(out)];
}

/** 開場許下、到現在還沒兌現的承諾。 */
export function brokenPromises(p: Progress): string[] {
  const kept = keptPromises(p);
  return promisesOf(p)
    .promises.map((x) => x.id)
    .filter((id) => !kept.includes(id));
}

/**
 * 結辯的起點：庭審留下的心證，再扣掉沒兌現的承諾（企劃書 6.9.3，陪審員記得你說過的話），
 * 再加上案件理論本身的代價（例如承認部分過失，陪審團評議時先記得這一點）。
 */
function closingStart(p: Progress): closing.ClosingState {
  const after = juryAfterTrial(p);
  if (!after) return closing.startClosing({});
  const broken = brokenPromises(p);
  const { theory: t, opening } = promisesOf(p);
  const amount = (opening?.broken ?? 8) * broken.length;
  const jury = amount > 0 ? shiftAll(after.rules, after.jury, amount).jury : after.jury;
  return closing.startClosing(closing.theoryCost(after.rules, jury, t?.jury), broken);
}

export function closingState(p: Progress, s: ClosingScene) {
  return stateOf(p, s, () => closingStart(p));
}

/** 結辯能挑的論點：手上已確認、而且不是只用於聲請的程序論點。 */
/** 手上所有論點，不管是在哪一個桌面推出來的（審前聲請要用調查階段的論點）。 */
export function heldArgs(p: Progress) {
  return episodeOf(p)
    .scenes.filter((s): s is DeskScene => s.type === 'desk')
    .flatMap((d) => d.questions)
    .filter((q) => p.cards.includes(q.argument.id))
    .map((q) => q.argument);
}

/**
 * 庭上能出示的論點：結辯能用的，加上只用於聲請、但正好是某位證人主張的反駁依據的
 * （例如「樣本不適用」拆費雪的倍數）。我方自己的風險評估不是任何主張的反駁，所以不會出現。
 */
export function courtArgs(p: Progress) {
  const rebuts = new Set(
    episodeOf(p)
      .scenes.filter((s): s is TrialScene => s.type === 'trial')
      .flatMap((t) => t.witness.claims.map((c) => c.argument)),
  );
  return heldArgs(p).filter((a) => !a.motionOnly || rebuts.has(a.id));
}

export function closingArgs(p: Progress) {
  return (deskSceneOf(p)?.questions ?? [])
    .filter((q) => p.cards.includes(q.argument.id) && !q.argument.motionOnly)
    .map((q) => q.argument);
}

/** 分支條件看得到的事：判決、選定的理論、旗標、倫理帳本。 */
/**
 * 這一集是不是提前收場（企劃書 10.9）：接受認罪協商（E4），
 * 或證人當庭援引緘默權、檢方撤回起訴（E1）。之後只演尾聲。
 * 劇本要寫了對應的尾聲（epilogue 且 when.outcome 含這種收場）才會提前結束，
 * 否則照常走到判決，免得玩家看到一集沒頭沒尾地結束。
 */
export function caseClosed(p: Progress): { outcome: branch.Outcome; deal: string | null } | null {
  const scenes = episodeOf(p).scenes;
  const written = (o: branch.Outcome) =>
    scenes.some((s) => 'epilogue' in s && s.epilogue && s.when?.outcome?.includes(o));
  for (const s of scenes) {
    const st = p.scenes[s.id];
    if (!st) continue;
    if (s.type === 'negotiation' && (st as nego.NegoState).outcome === 'deal' && written('deal'))
      return { outcome: 'deal', deal: (st as nego.NegoState).dealId ?? null };
    if (s.type === 'trial' && (st as trial.TrialState).pleaded && written('dismissed'))
      return { outcome: 'dismissed', deal: null };
  }
  return null;
}

export function branchContext(p: Progress): branch.BranchContext {
  return contextWith(p, allFlags(p));
}

function contextWith(p: Progress, flags: string[]): branch.BranchContext {
  const cs = episodeOf(p).scenes.find((x) => x.type === 'closing');
  const st = cs ? (p.scenes[cs.id] as closing.ClosingState | undefined) : undefined;
  const closed = caseClosed(p);
  return {
    verdict: st?.verdict ?? null,
    outcome: closed?.outcome ?? null,
    deal: closed?.deal ?? null,
    theory: promisesOf(p).theory?.id ?? null,
    flags,
    ethics: p.ethics ?? [],
    cards: p.cards,
    presented: presentedArgs(p),
    punitive: st?.award?.punitive?.found ?? (st?.verdict ? false : null),
  };
}

/** 懲罰性賠償要不要評議：符合 damages.punitive.when 其中一項才進入，回傳那一項的加成；都不符合是 null。 */
export function punitiveBonus(p: Progress, s: ClosingScene): number | null {
  const c = branchContext(p);
  const hit = s.damages?.punitive?.when.find((x) => branch.matches(x.when, c));
  return hit ? hit.bonus : null;
}

/** 調解室看到的開庭風險：判有責的金額區間，以及懲罰性賠償會不會進入評議。 */
export function trialRisk(p: Progress) {
  const cs = episodeOf(p).scenes.find((x): x is ClosingScene => x.type === 'closing');
  const ts = theorySceneOf(p);
  const range = cs && closing.exposure(cs, ts?.theories.map((x) => x.fault ?? 0) ?? []);
  if (!cs || !range) return null;
  return { ...range, punitive: punitiveBonus(p, cs) !== null };
}

/** 庭上出示過（對質過、逼出緘默權）或結辯講過的論點。 */
export function presentedArgs(p: Progress): string[] {
  const out = new Set<string>();
  for (const s of episodeOf(p).scenes) {
    const st = p.scenes[s.id];
    if (!st) continue;
    if (s.type === 'trial') {
      const t = st as trial.TrialState;
      for (const c of s.witness.claims)
        if ((t.claims?.[c.id]?.result ?? 'none') !== 'none') out.add(c.argument);
      if (s.fifth && (t.pleaded || t.stricken)) out.add(s.fifth.argument);
    }
    if (s.type === 'closing') {
      const c = st as closing.ClosingState;
      if (c.spoken) for (const id of c.picked) out.add(id);
    }
  }
  return [...out];
}

/** 對話選項此刻看不看得到：條件不符的選項不出現。 */
export function optionOpen(p: Progress, o: { when?: When }) {
  return branch.matches(o.when, branchContext(p));
}

/** 這一場的結局台詞，依判決與分支條件挑。 */
export function endingOf(p: Progress, s: ClosingScene) {
  return branch.endingLines(s, branchContext(p));
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
  // 開示時勉強過關、被裁定照交、硬藏被揭穿，錄取時亂異議，法官都記得。
  const cost = discoveryCost(p);
  // 審前動議核准（例如排除對方專家），陪審團一開始就沒那麼偏向對方。
  // 硬藏的文件被揭穿，法官指示陪審團可以做不利推定：一開始就更偏向對方。
  // 前面的選擇留下的代價（例如交出群組截圖）：陪審團一開始就往對方移。
  const shift = motionShift(p) - adverseShift(p) - effectSum(p, 'jury');
  const jurors = vd && st?.seated ? voirdire.panel(vd, st) : s.jurors;
  return {
    ...s,
    witness: { ...s.witness, direct: directFor(p, s) },
    jurors: shift
      ? jurors.map((j) => ({ ...j, start: Math.max(0, Math.min(100, j.start - shift)) }))
      : jurors,
    patience: Math.max(1, s.patience - (vd && st?.seated ? st.wrong : 0) - cost),
  };
}

/**
 * 這一場檢方真正會問的題目：條件不符的不問；審前裁定排除的證據照樣被問出來時，
 * 正確的異議變成「違反裁定」。
 */
function directFor(p: Progress, s: TrialScene): TrialScene['witness']['direct'] {
  const direct = s.witness.direct;
  if (!direct.some((q) => q.when || q.barred)) return direct;
  const c = branchContext(p);
  return direct
    .filter((q) => branch.matches(q.when, c))
    .map((q) =>
      q.barred && branch.matches(q.barred.when, c)
        ? { ...q, objection: '違反裁定' as const, sustained: q.barred.sustained ?? trial.BARRED }
        : q,
    );
}

/**
 * 生效中的排除裁定：本集任何一題的 barred 條件成立時，條件裡點名的卡就是那張裁定。
 * 回傳卡名，異議窗用來說明「違反裁定」的依據。
 */
export function rulingsIn(p: Progress): string[] {
  const ep = episodeOf(p);
  const c = branchContext(p);
  const ids = new Set<string>();
  for (const s of ep.scenes)
    if (s.type === 'trial')
      for (const q of s.witness.direct)
        if (q.barred && branch.matches(q.barred.when, c))
          for (const id of q.barred.when.cards ?? ['審前裁定']) ids.add(id);
  const cards = ep.scenes.flatMap((s) => (s.type === 'desk' ? s.cards : []));
  return [...ids].map((id) => cards.find((x) => x.id === id)?.name ?? id);
}

function motionShift(p: Progress): number {
  return episodeOf(p).scenes.reduce((n, d) => {
    if (d.type !== 'desk') return n;
    const st = p.scenes[d.id] as desk.DeskState | undefined;
    return (
      n + d.motions.reduce((m, x) => m + (st?.motions[x.id]?.ruling === 'granted' ? x.jury : 0), 0)
    );
  }, 0);
}

/** 開示讓法官少掉的耐心（所有桌面加總）。 */
function adverseShift(p: Progress): number {
  return episodeOf(p).scenes.reduce((n, x) => {
    const st = x.type === 'desk' ? (p.scenes[x.id] as desk.DeskState | undefined) : undefined;
    return n + (st ? discovery.adverse(st) : 0);
  }, 0);
}

function discoveryCost(p: Progress): number {
  return episodeOf(p).scenes.reduce((n, x) => {
    if (x.type === 'desk') {
      const st = p.scenes[x.id] as desk.DeskState | undefined;
      return n + (st ? discovery.patienceCost(st) : 0);
    }
    // 對方主導的錄取裡亂異議，法官讀筆錄時記得。
    if (x.type === 'deposition') return n + ((p.scenes[x.id] as depo.DepoState)?.wrong ?? 0);
    return n;
  }, 0);
}

/** 分支看得到的旗標：對話選項留下的，加上桌面（動議、開示）、談判（請示電話）與錄取（異議）留下的。 */
export function allFlags(p: Progress): string[] {
  const fromScenes = episodeOf(p).scenes.flatMap((x) =>
    x.type === 'desk' || x.type === 'negotiation' || x.type === 'deposition'
      ? ((p.scenes[x.id] as { flags?: string[] } | undefined)?.flags ?? [])
      : [],
  );
  const base = [...new Set([...(p.flags ?? []), ...fromScenes])];
  return [...new Set([...base, ...effectFlags(p, base)])];
}

/** 集層級 effects 的條件成立時算進來的旗標（這些會帶到下一集）。 */
function effectFlags(p: Progress, base: string[]): string[] {
  const effects = episodeOf(p).effects;
  if (!effects.some((e) => e.flags.length)) return [];
  const c = contextWith(p, base);
  return effects.filter((e) => branch.matches(e.when, c)).flatMap((e) => e.flags);
}

/** 現在成立的 effects（前面的選擇留下的代價）。 */
export function activeEffects(p: Progress) {
  const effects = episodeOf(p).effects;
  if (!effects.length) return [];
  const c = branchContext(p);
  return effects.filter((e) => branch.matches(e.when, c));
}

const effectSum = (p: Progress, key: 'jury' | 'confidence' | 'trust') =>
  activeEffects(p).reduce((n, e) => n + e[key], 0);

/** 前一場庭審的狀態（同一個陪審團，隔天繼續聽）。 */
export function previousJury(p: Progress, s: TrialScene): trial.TrialState | undefined {
  const scenes = episodeOf(p).scenes;
  const before = scenes.slice(
    0,
    scenes.findIndex((x) => x.id === s.id),
  );
  const prev = [...before].reverse().find((x) => x.type === 'trial' && p.scenes[x.id]);
  return prev ? (p.scenes[prev.id] as trial.TrialState) : undefined;
}

export function trialState(p: Progress, s: TrialScene) {
  return stateOf(p, s, () =>
    trial.startTrial(courtScene(p, s), anchoredClaims(p), previousJury(p, s)),
  );
}

export function depoState(p: Progress, s: DepositionScene) {
  return stateOf(p, s, () => depo.startDeposition(s));
}

export function negoState(p: Progress, s: NegotiationScene) {
  return stateOf(p, s, () => nego.startNegotiation(negoScene(p, s)));
}

/** 調解開始時對方的信心與客戶的信任，加上前面的選擇留下的代價。 */
export function negoScene(p: Progress, s: NegotiationScene): NegotiationScene {
  const confidence = effectSum(p, 'confidence');
  const trust = effectSum(p, 'trust');
  if (!confidence && !trust) return s;
  return {
    ...s,
    confidence: Math.max(0, Math.min(100, s.confidence + confidence)),
    client: { ...s.client, trust: Math.max(0, Math.min(5, s.client.trust + trust)) },
  };
}

/** 書桌上的開示請求：特權已經被放棄的（waived 成立），valid 降成 weak。 */
export function deskScene(p: Progress, s: DeskScene): DeskScene {
  if (!s.discovery.some((r) => r.waived)) return s;
  const c = branchContext(p);
  return {
    ...s,
    discovery: s.discovery.map((r) =>
      r.waived && r.privilege === 'valid' && branch.matches(r.waived, c)
        ? { ...r, privilege: 'weak' as const }
        : r,
    ),
  };
}

/** 辯方證人這一場真正能問的題目與對方會多問的題：條件不符的拿掉。 */
export function witnessScene(p: Progress, s: DefenseScene): DefenseScene {
  const conditional = [...s.questions, ...s.cross, ...s.prep.options].some((x) => x.when);
  if (!conditional) return s;
  const c = branchContext(p);
  return {
    ...s,
    prep: { ...s.prep, options: s.prep.options.filter((o) => branch.matches(o.when, c)) },
    questions: s.questions.filter((q) => branch.matches(q.when, c)),
    cross: s.cross.filter((x) => branch.matches(x.when, c)),
  };
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
    // 交出去的文件，對方看得懂它指向哪個論點。
    if (s.type === 'desk') {
      const a = discovery.answered(st as desk.DeskState);
      for (const r of s.discovery)
        if (a[r.id] === 'produced' || a[r.id] === 'compelled') out.push(...r.exposes);
    }
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
  /** 從指定集數開新遊戲（預設第 1 集）。 */
  newGame: (episode?: string) => void;
  /** 這一集演完之後接下一集，帶著跨集旗標與倫理紀錄。 */
  nextEpisode: () => void;
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
  /** 證據開示：回應對方的一項請求（交出／主張特權／主張範圍過廣），送出就定案。 */
  respondDiscovery: (request: string, response: discovery.Response) => void;
  toggleCard: (qid: string, card: string) => void;
  toggleTimeline: (card: string) => void;
  moveTimeline: (card: string, dir: -1 | 1) => void;
  toggleLinkCard: (card: string) => void;
  setLinkRelation: (r: Relation) => void;
  connect: () => void;
  submit: (qid: string) => void;
  /** 法庭 */
  nextQuestion: () => void;
  letPass: () => void;
  object: (reason: trial.Objection) => void;
  toCross: () => void;
  lock: (claim: string, how: 'strong' | 'weak') => void;
  setup: (claim: string) => void;
  confront: (claim: string, strength: number, tags: Tag[], argument: string) => void;
  badger: (i: number) => void;
  finishTrial: () => void;
  /** 結辯 */
  pickArg: (id: string) => void;
  setTone: (id: string) => void;
  deliver: () => void;
  /** 辯方證人 */
  prepareWitness: (id: string) => void;
  askWitness: (qid: string) => void;
  finishWitness: () => void;
  /** 案件理論與開場陳述 */
  chooseTheory: (id: string) => void;
  skipTheory: () => void;
  togglePromise: (id: string) => void;
  deliverOpening: () => void;
  /** 陪審團遴選 */
  askJuror: (id: string) => void;
  challengeJuror: (id: string) => void;
  strikeJuror: (id: string) => void;
  seatJury: () => void;
  /** 證詞錄取 */
  askDepo: (question: string) => void;
  finishDepo: () => void;
  /** 對方主導的錄取：對現在這一題異議（null＝不異議）。 */
  defendDepo: (reason: depo.DepoObjection | null) => void;
  /** 談判 */
  revealArg: (id: string, strength: number, name: string) => void;
  bluff: (id: string) => void;
  advise: (take: boolean) => void;
  walkOut: () => void;
  /** 和解金額超過授權上限時，打電話請示委託人。 */
  callClient: () => void;
}

/** 出示這個論點會兌現的承諾（還沒兌現過的那一個）。 */
function promiseFor(argument: string) {
  const p = useEpisode.getState().progress;
  const kept = keptPromises(p);
  const { promises, opening } = promisesOf(p);
  const hit = promises.find((x) => x.argument === argument && !kept.includes(x.id));
  return hit ? { id: hit.id, kept: opening?.kept ?? 5 } : undefined;
}

export const useEpisode = create<GameState>()((set, get) => {
  /** 換場時自動存檔。 */
  const nextScene = (p: Progress): Progress => {
    let next = { ...p, scene: p.scene + 1, step: 0 };
    // 條件不符的尾聲整場跳過。
    const scenes = episodeOf(p).scenes;
    while (next.scene < scenes.length) {
      const s = scenes[next.scene];
      // 提前收場：只剩標了 epilogue 的尾聲場景。
      const epilogue = 'epilogue' in s && s.epilogue;
      const skip =
        (caseClosed(next) && !epilogue) ||
        ('when' in s && !branch.matches(s.when, branchContext(next)));
      if (!skip) break;
      next = { ...next, scene: next.scene + 1 };
    }
    writeSave('auto', saveLabel(next), next);
    return next;
  };

  /**
   * 套用一個場景動作，並把該場景的狀態寫回進度。
   * `map` 用來把劇本裡的場景換成「真正上場的」那一版——法庭的陪審團
   * 是遴選留下的 12 位，動作也必須拿到同一份名單，否則衝擊會算在
   * 劇本預設的陪審員身上，畫面上的人反而不動。
   */
  const on =
    <S extends Scene, T>(type: S['type'], init: (s: S) => T, map?: (s: S) => S) =>
    (f: (s: S, st: T) => T, carry?: (s: S, st: T) => string[]) => {
      const p = get().progress;
      const raw = sceneOf(p) as S | null;
      if (!raw || raw.type !== type) return;
      const s = map ? map(raw) : raw;
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
  const onDesk = on<DeskScene, desk.DeskState>('desk', desk.startDesk, (s) =>
    deskScene(get().progress, s),
  );
  const onTrial = on<TrialScene, trial.TrialState>(
    'trial',
    (s) => trial.startTrial(s, anchoredClaims(get().progress), previousJury(get().progress, s)),
    (s) => courtScene(get().progress, s),
  );
  const onVoirDire = on<VoirDireScene, voirdire.VoirDireState>('voirdire', voirdire.startVoirDire);
  const onClosing = on<ClosingScene, closing.ClosingState>('closing', () =>
    closingStart(get().progress),
  );
  const onDefense = on<DefenseScene, defense.DefenseState>(
    'defense',
    () => defense.startDefense(juryAfterTrial(get().progress)?.jury ?? {}),
    (s) => witnessScene(get().progress, s),
  );
  const onTheory = on<TheoryScene, theory.TheoryState>('theory', theory.startTheory);
  const onOpening = on<OpeningScene, theory.OpeningState>('opening', theory.startOpening);
  const onDepo = on<DepositionScene, depo.DepoState>('deposition', depo.startDeposition);
  const onNego = on<NegotiationScene, nego.NegoState>('negotiation', nego.startNegotiation, (s) =>
    negoScene(get().progress, s),
  );

  return {
    mode: 'title',
    progress: start('ep1'),
    newGame: (episode = 'ep1') =>
      set({ mode: 'play', progress: start(episode in episodes ? episode : 'ep1') }),
    nextEpisode: () => {
      const p = get().progress;
      const next = followingEpisode(p);
      if (!next || sceneOf(p)) return;
      const progress = carryOver(p, next);
      writeSave('auto', saveLabel(progress), progress);
      set({ mode: 'play', progress });
    },
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
      const o = step.options[option];
      if ('when' in o && !branch.matches(o.when, branchContext(p))) return;
      // 電話場景的選項沒有旗標與倫理紀錄。
      const gained = 'flags' in o ? o : { flags: [], ethics: [] };
      set({
        progress: {
          ...p,
          choices: { ...p.choices, [`${s.id}:${p.step}`]: option },
          flags: [...new Set([...(p.flags ?? []), ...gained.flags])],
          ethics: [...(p.ethics ?? []), ...gained.ethics],
        },
      });
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
    respondDiscovery: (r, resp) => {
      onDesk((s, st) => discovery.respond(s, st, r, resp, get().progress.cards));
      // 硬藏記進倫理帳本（之後在庭上被揭穿）。
      const p = get().progress;
      const s = sceneOf(p);
      const result = s?.type === 'desk' ? deskState(p, s).discovery?.[r] : undefined;
      if (result === 'concealed' && !(p.ethics ?? []).includes(discovery.CONCEALED))
        set({ progress: { ...p, ethics: [...(p.ethics ?? []), discovery.CONCEALED] } });
    },
    toggleCard: (qid, card) =>
      onDesk((s, st) => desk.toggleCard(s, st, qid, card, get().progress.cards)),
    toggleTimeline: (card) => onDesk((_s, st) => desk.toggleTimeline(st, card)),
    moveTimeline: (card, dir) => onDesk((_s, st) => desk.moveTimeline(st, card, dir)),
    toggleLinkCard: (card) => onDesk((_s, st) => desk.toggleLinkCard(st, card)),
    setLinkRelation: (r) => onDesk((_s, st) => desk.setLinkRelation(st, r)),
    connect: () => onDesk((s, st) => desk.connect(s, st)),
    submit: (qid) =>
      onDesk(
        (s, st) => desk.submit(s, st, qid, get().progress.cards),
        (s, st) => desk.heldCards(s, st, get().progress.cards),
      ),

    nextQuestion: () => onTrial((s, st) => trial.nextQuestion(s, st)),
    letPass: () => onTrial((s, st) => trial.letPass(s, st)),
    object: (reason) => onTrial((s, st) => trial.object(s, st, reason)),
    toCross: () => onTrial((s, st) => trial.toCross(s, st)),
    lock: (claim, how) => onTrial((s, st) => trial.lock(s, st, claim, how)),
    setup: (claim) => onTrial((s, st) => trial.setup(s, st, claim)),
    confront: (claim, strength, tags, argument) =>
      onTrial((s, st) =>
        trial.confront(s, st, claim, strength, tags, {
          id: argument,
          exposed: exposedArgs(get().progress).includes(argument),
          cards: get().progress.cards,
          promise: promiseFor(argument),
          theory: promisesOf(get().progress).theory?.id ?? null,
        }),
      ),
    badger: (i) => onTrial((s, st) => trial.badger(s, st, i)),
    pickArg: (id) => onClosing((s, st) => closing.togglePick(s, st, id)),
    setTone: (id) => onClosing((s, st) => closing.setTone(s, st, id)),
    deliver: () =>
      onClosing((s, st) => {
        const p = get().progress;
        const after = juryAfterTrial(p);
        if (!after) return st;
        const out = closing.deliver(
          s,
          st,
          after.rules,
          closingArgs(p),
          exposedArgs(p),
          !!promisesOf(p).theory,
        );
        if (out.verdict !== '有責') return out;
        return {
          ...out,
          award: closing.award(
            s,
            after.rules,
            out.jury,
            promisesOf(p).theory?.fault ?? 0,
            punitiveBonus(p, s),
            promisesOf(p).theory?.faultWhy,
          ),
        };
      }),

    prepareWitness: (id) => {
      const p = get().progress;
      const s = sceneOf(p);
      const o =
        s?.type === 'defense' ? witnessScene(p, s).prep.options.find((x) => x.id === id) : null;
      const before =
        s?.type === 'defense' ? (p.scenes[s.id] as defense.DefenseState | undefined) : undefined;
      if (!o || before?.stage === 'direct' || before?.stage === 'done') return;
      onDefense((sc, st) => defense.prepare(sc, st, id));
      // 倫理紀錄與旗標記在選擇的當下；玩家看不到，季終才會翻出來。
      const q = get().progress;
      set({
        progress: {
          ...q,
          flags: [...new Set([...(q.flags ?? []), ...o.flags])],
          ethics: [...(q.ethics ?? []), ...o.ethics],
        },
      });
    },
    askWitness: (qid) => {
      const asked = (p: Progress) => {
        const s = sceneOf(p);
        return s?.type === 'defense' && defenseState(p, s).asked.includes(qid);
      };
      const already = asked(get().progress);
      onDefense((sc, st) => {
        const after = juryAfterTrial(get().progress);
        return after ? defense.ask(sc, st, after.rules, qid, get().progress.cards) : st;
      });
      // 明知證詞是假的還讓他在陪審團面前說：問出口的當下記進倫理帳本。
      const p = get().progress;
      const s = sceneOf(p);
      if (s?.type !== 'defense' || already || !asked(p)) return;
      const q = s.questions.find((x) => x.id === qid);
      const fresh = (q?.ethicsIf?.ethics ?? []).filter((e) => !(p.ethics ?? []).includes(e));
      if (fresh.length && q!.ethicsIf!.has.every((x) => p.cards.includes(x)))
        set({ progress: { ...p, ethics: [...(p.ethics ?? []), ...fresh] } });
    },
    finishWitness: () =>
      onDefense((sc, st) => {
        const after = juryAfterTrial(get().progress);
        return after ? defense.finish(sc, st, after.rules) : st;
      }),
    chooseTheory: (id) => {
      const was = promisesOf(get().progress).theory?.id;
      onTheory((s, st) => theory.choose(s, st, id, get().progress.cards));
      const p = get().progress;
      const t = promisesOf(p).theory;
      // 明知故犯：手上已經有推翻這個理論的論點，還是選了它。
      if (t?.id === id && was !== id && t.ethicsIf?.has.every((x) => p.cards.includes(x)))
        set({ progress: { ...p, ethics: [...(p.ethics ?? []), ...t.ethicsIf.ethics] } });
    },
    skipTheory: () => onTheory((s, st) => theory.skip(s, st, get().progress.cards)),
    togglePromise: (id) =>
      onOpening((s, st) => theory.togglePromise(s, promisesOf(get().progress).theory, st, id)),
    deliverOpening: () => onOpening((_s, st) => theory.deliver(st)),

    askJuror: (id) => onVoirDire((s, st) => voirdire.ask(s, st, id)),
    challengeJuror: (id) => onVoirDire((s, st) => voirdire.challenge(s, st, id)),
    strikeJuror: (id) => onVoirDire((s, st) => voirdire.strike(s, st, id)),
    seatJury: () => onVoirDire((s, st) => voirdire.seat(s, st)),

    askDepo: (q) =>
      onDepo(
        (s, st) => depo.ask(s, st, q),
        (_s, st) => st.gained,
      ),
    defendDepo: (reason) =>
      onDepo(
        (s, st) => depo.defend(s, st, reason),
        (_s, st) => st.gained,
      ),
    finishDepo: () => onDepo((_s, st) => depo.finish(st)),

    revealArg: (id, strength, name) => {
      // 只用於聲請的程序論點（例如我方自己的風險評估）不能拿去攤牌。
      if (!closingArgs(get().progress).some((a) => a.id === id)) return;
      onNego((s, st) => nego.reveal(s, st, id, strength, name));
    },
    bluff: (id) => onNego((s, st) => nego.bluff(s, st, id, get().progress.cards)),
    advise: (take) => onNego((s, st) => nego.advise(s, st, take)),
    walkOut: () => onNego((s, st) => nego.walk(s, st)),
    callClient: () => onNego((s, st) => nego.call(s, st)),

    finishTrial: () => onTrial((_s, st) => trial.finish(st)),
  };
});

/** 手上的一張證據或論點，任何畫面都可以用它開證據抽屜。 */
export interface Evidence {
  id: string;
  name: string;
  kind: string;
  text: string;
  date?: string;
  time?: string;
  source: string;
  image?: string;
}

/**
 * 玩家目前手上的所有證據與確認過的論點。
 * 抽屜要在每一個畫面都打得開，所以這份清單不綁在某一幕的桌面上。
 */
export function evidence(p: Progress): Evidence[] {
  const out: Evidence[] = [];
  const seen = new Set<string>();
  for (const s of episodeOf(p).scenes) {
    if (s.type !== 'desk') continue;
    for (const q of s.questions) {
      const a = q.argument;
      if (!p.cards.includes(a.id) || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ ...a, kind: '論點', source: `強度 ${a.strength}・${a.tags.join('、')}` });
    }
    for (const c of s.cards) {
      if (!p.cards.includes(c.id) || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        text: c.text,
        date: c.date,
        time: c.time,
        source: c.source,
        image: c.image,
      });
    }
  }
  return out;
}
