import * as closing from './episode/closing';
import * as discovery from './episode/discovery';
import type * as desk from './episode/desk';
import type { ClosingScene, DeskScene } from './episode/schema';
import type * as trial from './episode/trial';
import {
  brokenPromises,
  closingArgs,
  activeEffects,
  closingState,
  courtScene,
  episodeOf,
  exposedArgs,
  juryAfterTrial,
  promisesOf,
  theorySceneOf,
  trialRisk,
} from './game';
import { applyImpact, shiftAll, type Jury, type JuryRules } from './jury';
import type { Progress } from './save';

/**
 * 判決頁「這一案的帳」的一筆。amount 是這件事讓陪審團平均往對方移了幾分（0–100 的量表），
 * 越大越傷；只有懲罰性賠償用 money 記金額（amount 為 0，不參與排序）。
 */
export interface LedgerItem {
  kind:
    | 'theory'
    | 'broken'
    | 'empty'
    | 'noTheory'
    | 'tone'
    | 'exposed'
    | 'unimpeached'
    | 'concealed'
    | 'effect'
    | 'punitive';
  amount: number;
  where: '開示' | '審前' | '開場' | '庭審' | '結辯' | '評議';
  /** 相關的 id：承諾、論點、基調、主張、開示請求、理論。 */
  refs: string[];
  /** 不能只靠 id 說清楚時的名字（例如證人）。 */
  who?: string;
  money?: number;
}

const avg = (rules: JuryRules, j: Jury) =>
  rules.jurors.reduce((n, x) => n + (j[x.id] ?? 0), 0) / Math.max(1, rules.jurors.length);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 重播結辯需要的一切。結辯狀態裡的 jury 已經是評議後的結果，起點要照 closingStart 重算：
 * 庭審後的心證，扣掉沒兌現的承諾，再加理論代價。
 */
export function closingReplay(p: Progress) {
  const ep = episodeOf(p);
  const cs = ep.scenes.find((x): x is ClosingScene => x.type === 'closing');
  const after = juryAfterTrial(p);
  if (!cs || !after) return null;
  const st = closingState(p, cs);
  if (!st.verdict) return null;
  const rules = after.rules;
  const broken = brokenPromises(p);
  const { theory: th, opening } = promisesOf(p);
  const brokenAmount = (opening?.broken ?? 8) * broken.length;
  const afterBroken =
    brokenAmount > 0 ? shiftAll(rules, after.jury, brokenAmount).jury : after.jury;
  const opened = closing.theoryCost(rules, afterBroken, th?.jury);
  return {
    ep,
    cs,
    st,
    rules,
    after,
    broken,
    th,
    afterBroken,
    opened,
    begin: { ...st, jury: opened },
    held: closingArgs(p),
    exposed: exposedArgs(p),
    hasTheory: !!th,
  };
}

/** 依傷害大小排好的帳；判決還沒出來時是空的。 */
export function ledger(p: Progress): LedgerItem[] {
  const r = closingReplay(p);
  if (!r) return [];
  const {
    ep,
    cs,
    st,
    rules,
    after,
    broken,
    th,
    afterBroken,
    opened,
    begin,
    held,
    exposed,
    hasTheory,
  } = r;
  const out: LedgerItem[] = [];
  const add = (item: LedgerItem) => {
    if (item.amount > 0.05 || item.kind === 'punitive')
      out.push({ ...item, amount: round1(item.amount) });
  };

  // 開示：硬藏被揭穿，開庭時陪審團就先往對方移。
  for (const d of ep.scenes) {
    if (d.type !== 'desk') continue;
    const ds = p.scenes[d.id] as desk.DeskState | undefined;
    if (!ds) continue;
    const hidden = Object.entries(discovery.answered(ds))
      .filter(([, r]) => r === 'concealed')
      .map(([id]) => id);
    if (hidden.length)
      add({
        kind: 'concealed',
        amount: hidden.length * discovery.ADVERSE,
        where: '開示',
        refs: hidden,
      });
  }

  // 審前：前面的選擇留下的代價（例如交出群組截圖），開庭時陪審團就往對方移。refs 是觸發它的旗標。
  for (const x of activeEffects(p))
    if (x.jury > 0)
      add({ kind: 'effect', amount: x.jury, where: '審前', refs: x.when.flags ?? [] });

  // 庭審：有反駁論點卻沒被彈劾的關鍵證詞。值多少＝當時用強鎖定彈劾成功會拉回來的量。
  const args = new Map(
    ep.scenes
      .filter((x): x is DeskScene => x.type === 'desk')
      .flatMap((d) => d.questions.map((q) => [q.argument.id, q.argument] as const)),
  );
  for (const s of ep.scenes) {
    if (s.type !== 'trial') continue;
    const ts = p.scenes[s.id] as trial.TrialState | undefined;
    if (!ts || ts.pleaded || ts.stricken) continue;
    // 陪審員要用選任後實際坐進席位的那幾位，場景原本的 jurors 對不上心證的 id。
    const t = courtScene(p, s);
    for (const c of t.witness.claims) {
      if (ts.claims[c.id]?.result !== 'none') continue;
      const a = args.get(c.argument);
      if (!a) continue;
      const hit = applyImpact(t, ts.jury, a.strength, a.tags, 1.5).jury;
      add({
        kind: 'unimpeached',
        amount: avg(t, ts.jury) - avg(t, hit),
        where: '庭審',
        refs: [t.id, c.id],
        who: t.witness.name,
      });
    }
  }

  // 開場：沒兌現的承諾，以及理論本身的代價（結辯起點就是這樣算出來的）。
  if (broken.length)
    add({
      kind: 'broken',
      amount: avg(rules, afterBroken) - avg(rules, after.jury),
      where: '開場',
      refs: broken,
    });
  if (th?.jury)
    add({
      kind: 'theory',
      amount: avg(rules, opened) - avg(rules, afterBroken),
      where: '開場',
      refs: [th.id],
    });

  // 結辯：換一個做法重播同一段話，差多少就是這一項的代價。
  const spoken = avg(rules, closing.speak(cs, begin, rules, held, exposed, hasTheory));
  const empty = cs.picks - st.picked.length;
  if (empty > 0)
    add({
      kind: 'empty',
      amount:
        avg(rules, shiftAll(rules, opened, closing.EMPTY_SLOT * empty).jury) - avg(rules, opened),
      where: '結辯',
      refs: [],
    });
  if (!hasTheory)
    add({
      kind: 'noTheory',
      amount: spoken - avg(rules, closing.speak(cs, begin, rules, held, exposed, true)),
      where: '結辯',
      refs: [],
    });
  const leaked = st.picked.filter((id) => exposed.includes(id));
  if (leaked.length)
    add({
      kind: 'exposed',
      amount: spoken - avg(rules, closing.speak(cs, begin, rules, held, [], hasTheory)),
      where: '結辯',
      refs: leaked,
    });
  const best = Math.min(
    ...cs.tones.map((t) =>
      avg(rules, closing.speak(cs, begin, rules, held, exposed, hasTheory, t.id)),
    ),
  );
  if (st.tone) add({ kind: 'tone', amount: spoken - best, where: '結辯', refs: [st.tone] });

  out.sort((a, b) => b.amount - a.amount);
  if (st.award?.punitive?.found)
    out.push({
      kind: 'punitive',
      amount: 0,
      where: '評議',
      refs: [],
      money: st.award.punitive.amount,
    });
  return out;
}

/**
 * 理論卡「若判有責」的金額區間：這個理論的死者過失比例，加減票數浮動。
 * 懲罰性賠償已經會進入評議時，一併告訴畫面（金額另計，比例是 ratio 倍）。
 */
export function theoryOutlook(p: Progress, theoryId: string) {
  const cs = episodeOf(p).scenes.find((x): x is ClosingScene => x.type === 'closing');
  const t = theorySceneOf(p)?.theories.find((x) => x.id === theoryId);
  const d = cs?.damages;
  if (!d || !t) return null;
  const at = (fault: number) =>
    Math.round((d.total * (100 - Math.max(0, Math.min(100, fault)))) / 100);
  return {
    low: at((t.fault ?? 0) + d.swing),
    high: at((t.fault ?? 0) - d.swing),
    punitive: trialRisk(p)?.punitive ?? false,
    ratio: d.punitive?.ratio ?? null,
  };
}
