import { TERMS } from '../jury';
import type {
  When,
  Card,
  DefenseScene,
  DepositionScene,
  DeskScene,
  Episode,
  NegotiationScene,
  TheoryScene,
  TrialScene,
  VoirDireScene,
} from './schema';

/** 劇本邏輯檢查（企劃書 v2.0 第 14 節）。CI 每個 PR 都跑，劇本錯了不會進 main。 */
export function validateEpisode(e: Episode): string[] {
  const errors: string[] = [];
  const sceneIds = new Set<string>();
  /** 玩家走到某個場景時，手上可能有的卡片。 */
  const available = new Set<string>();
  const args = new Set<string>();

  for (const s of e.scenes) {
    if (sceneIds.has(s.id)) errors.push(`場景 id 重複：${s.id}`);
    sceneIds.add(s.id);

    if (s.type === 'phone') {
      const messages = new Set<string>();
      let last = '';
      s.steps.forEach((step, i) => {
        const where = `場景 ${s.id} 第 ${i + 1} 步`;
        // 真相一致：同一場景裡時間只能往前走。
        if ('time' in step && step.time) {
          if (step.time < last) errors.push(`${where} 的時間 ${step.time} 早於前一步 ${last}`);
          last = step.time;
        }
        if ((step.do === 'notify' || step.do === 'say') && step.message.id) {
          if (messages.has(step.message.id))
            errors.push(`${where} 的訊息 id 重複：${step.message.id}`);
          messages.add(step.message.id);
        }
        if (step.do === 'retract' && !messages.has(step.target))
          errors.push(`${where} 要收回的訊息 ${step.target} 不存在或還沒出現`);
        if (step.do === 'say' && step.message.from === 'me' && i === 0)
          errors.push(`${where} 由玩家先送訊息，但還沒打開任何聊天室`);
      });
    }

    if (s.type === 'interview') {
      const topicIds = new Set<string>();
      for (const t of s.topics) {
        if (topicIds.has(t.id)) errors.push(`訪談 ${s.id} 的話題 id 重複：${t.id}`);
        topicIds.add(t.id);
        for (const n of t.needs)
          if (!available.has(n)) errors.push(`訪談 ${s.id} 的話題 ${t.id} 需要玩家還拿不到的 ${n}`);
        t.gives.forEach((g) => available.add(g));
      }
      for (const p of s.press) {
        if (!available.has(p.needs))
          errors.push(`訪談 ${s.id} 的施壓 ${p.id} 需要玩家還拿不到的 ${p.needs}`);
        p.gives.forEach((g) => available.add(g));
      }
      if (!s.topics.some((t) => t.key)) errors.push(`訪談 ${s.id} 沒有任何關鍵話題`);
    }

    if (s.type === 'desk') deskErrors(s, available, args, errors);
    if (s.type === 'trial') trialErrors(s, available, args, errors);
    if (s.type === 'deposition') depoErrors(s, available, args, errors);
    if (s.type === 'negotiation') negoErrors(s, available, args, errors);
    if (s.type === 'voirdire') voirDireErrors(s, errors);
    if (s.type === 'theory') theoryErrors(s, args, e, errors);
    if (s.type === 'defense') defenseErrors(s, e, errors);
    branchErrors(s, e, errors);
  }
  effectErrors(e, errors);
  custodyErrors(e, errors);
  batesErrors(e, errors);
  const { check } = whenChecker(e, errors);
  e.disposition?.forEach((d, i) => check(d.when, `登錄表最後一行第 ${i + 1} 項`));
  openingErrors(e, errors);
  burdenErrors(e, errors);
  lineErrors(e, errors);
  return errors;
}

/**
 * 舉證門檻：同一集的庭審用同一種（刑事或民事）；結辯要寫這種門檻會出現的判決；
 * 分支條件用的判決詞也要對（民事寫有責／無責，不寫有罪／無罪）。
 */
function burdenErrors(e: Episode, errors: string[]) {
  const trials = e.scenes.filter((x) => x.type === 'trial');
  const kinds = new Set(trials.map((t) => t.burden));
  if (kinds.size > 1) errors.push('同一集的庭審混用了刑事與民事門檻');
  const burden = trials[0]?.burden ?? 'criminal';
  const w = TERMS[burden];
  const other = TERMS[burden === 'civil' ? 'criminal' : 'civil'];
  for (const t of trials) {
    if (t.quorum && t.quorum > t.jurors.length)
      errors.push(`法庭 ${t.id} 的判決人數 ${t.quorum} 多於陪審員 ${t.jurors.length} 位`);
    if (t.quorum && t.quorum * 2 <= t.jurors.length)
      errors.push(`法庭 ${t.id} 的判決人數 ${t.quorum} 沒有過半，兩邊可能同時成立`);
  }
  const vd = e.scenes.find((x) => x.type === 'voirdire');
  // 預設陪審團（沒走遴選時用）和遴選選出來的人數要一致，量表與判決才不會跟著路線變。
  for (const t of trials)
    if (vd && t.jurors.length !== vd.seats)
      errors.push(
        `法庭 ${t.id} 寫了 ${t.jurors.length} 位陪審員，遴選 ${vd.id} 卻選 ${vd.seats} 位`,
      );
  if (vd && trials.some((t) => t.quorum && t.quorum > vd.seats))
    errors.push(`遴選 ${vd.id} 只選 ${vd.seats} 位，少於判決需要的人數`);
  const wrong = (v: string[] | undefined, where: string) => {
    for (const x of v ?? [])
      if (x === other.yes || x === other.no)
        errors.push(`${where} 用了「${x}」，這一集是${w.standard}，判決是${w.yes}或${w.no}`);
  };
  for (const s of e.scenes) {
    if ('when' in s) wrong(s.when?.verdict, `場景 ${s.id}`);
    if (s.type === 'closing') {
      for (const v of [w.yes, w.no] as const)
        if (!s.verdicts[v]) errors.push(`結辯 ${s.id} 少了判決「${v}」的結局`);
      for (const v of [other.yes, other.no] as const)
        if (s.verdicts[v]) errors.push(`結辯 ${s.id} 寫了這一集不會出現的判決「${v}」`);
      for (const x of s.endings) wrong(x.when.verdict, `結辯 ${s.id} 的結局 ${x.id}`);
    }
  }
  e.disposition?.forEach((d, i) => wrong(d.when.verdict, `登錄表最後一行第 ${i + 1} 項`));
}

/**
 * 心聲的新寫法（設計稿 inner-voice）。對白框裡不再出現「盧卡斯（心裡）」：
 * 沒說出口的話改成介面記號（mark）或畫外字幕（voice:'off'）。
 */
function lineErrors(e: Episode, errors: string[]) {
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.who === 'string' && typeof o.text === 'string') {
      if (o.who.includes('（心裡）') || o.text.includes('（心裡）'))
        errors.push(`${where} 寫了「（心裡）」：改成介面記號 mark 或畫外字幕 voice: off`);
      if (o.beats && o.voice !== 'off')
        errors.push(`${where} 有 beats，但不是畫外字幕（voice: off）`);
      if (o.mark && o.voice === 'off') errors.push(`${where} 同時是介面記號和畫外字幕，只能選一種`);
      if (o.mark && o.thought)
        errors.push(`${where} 同時是介面記號和舊的心聲 thought，拿掉 thought`);
    }
    for (const [k, x] of Object.entries(o)) walk(x, `${where}.${k}`);
  };
  for (const s of e.scenes) walk(s, `場景 ${s.id}`);
}

function deskErrors(s: DeskScene, available: Set<string>, args: Set<string>, errors: string[]) {
  const cards = new Set(s.cards.map((c) => c.id));
  for (const m of s.timelineMarks)
    for (const c of m.cards) {
      const card = s.cards.find((x) => x.id === c);
      if (!card) errors.push(`桌面 ${s.id} 的時間線記號用了不存在的卡片 ${c}`);
      else if (!card.time && !card.arrivesAt)
        errors.push(`桌面 ${s.id} 的時間線記號用了沒有時間的卡片 ${c}`);
    }
  const dupes = new Set<string>();
  for (const c of s.cards) {
    if (dupes.has(c.id)) errors.push(`桌面 ${s.id} 的卡片 id 重複：${c.id}`);
    dupes.add(c.id);
  }
  // 前面幕帶進來的卡片，也要在這一幕有定義，否則證據庫會顯示不出來。
  // 論點卡是推理鏈產生的，定義在疑問裡，不必再寫進牌庫。
  for (const id of available)
    if (!cards.has(id) && !args.has(id))
      errors.push(`桌面 ${s.id} 少了前面幕帶進來的卡片定義 ${id}`);

  const reachable = new Set<string>([
    ...available,
    ...s.cards.filter((c) => c.held).map((c) => c.id),
  ]);
  for (const d of s.docs)
    for (const l of d.lines)
      if (l.fact) {
        if (!cards.has(l.fact)) errors.push(`卷宗 ${d.id} 標記了不存在的卡片 ${l.fact}`);
        reachable.add(l.fact);
      }
  for (const m of s.mail)
    for (const g of m.gives) {
      if (!cards.has(g)) errors.push(`郵件 ${m.id} 附了不存在的卡片 ${g}`);
      reachable.add(g);
    }
  // 委託、動議、疑問會互相解鎖（動議要論點，論點要動議拿到的卡片），所以推到不動為止。
  const unlocked = {
    jobs: new Set<string>(),
    motions: new Set<string>(),
    links: new Set<string>(),
    questions: new Set<string>(),
  };
  const has = (ids: string[]) => ids.every((i) => reachable.has(i));
  for (;;) {
    const before = reachable.size;
    for (const j of s.jobs)
      if (!unlocked.jobs.has(j.id) && has(j.needs)) {
        unlocked.jobs.add(j.id);
        j.gives.forEach((g) => reachable.add(g));
      }
    for (const m of s.motions)
      if (!unlocked.motions.has(m.id) && has(m.needs) && has(m.support)) {
        unlocked.motions.add(m.id);
        m.gives.forEach((g) => reachable.add(g));
        m.twist?.options.forEach((o) => o.gives.forEach((g) => reachable.add(g)));
      }
    for (const l of s.links)
      if (!unlocked.links.has(l.id) && has(l.cards)) {
        unlocked.links.add(l.id);
        reachable.add(l.id);
      }
    for (const q of s.questions)
      if (!unlocked.questions.has(q.id) && has(q.answer) && has(q.unlock)) {
        unlocked.questions.add(q.id);
        reachable.add(q.argument.id);
      }
    if (reachable.size === before) break;
  }

  for (const j of s.jobs) {
    for (const n of j.needs)
      if (!reachable.has(n)) errors.push(`委託 ${j.id} 需要玩家拿不到的卡片 ${n}`);
    for (const g of j.gives) if (!cards.has(g)) errors.push(`委託 ${j.id} 給了不存在的卡片 ${g}`);
  }
  for (const m of s.motions) {
    for (const n of [...m.needs, ...m.support])
      if (!reachable.has(n)) errors.push(`動議 ${m.id} 需要玩家拿不到的 ${n}`);
    const answers = [...m.support, ...Object.values(m.accept).flat()];
    for (const l of m.lures) {
      if (!cards.has(l) && !args.has(l) && !s.questions.some((q) => q.argument.id === l))
        errors.push(`動議 ${m.id} 的誘答 ${l} 不存在`);
      if (answers.includes(l)) errors.push(`動議 ${m.id} 的誘答 ${l} 其實是正解`);
    }
    if (m.lures.length < 2) errors.push(`動議 ${m.id} 至少要有兩個誘答，否則證物格等於攤答案`);
    if (!m.bases.includes(m.basis)) errors.push(`動議 ${m.id} 的正解理由 ${m.basis} 不在選項裡`);
    if (!m.requests.includes(m.request))
      errors.push(`動議 ${m.id} 的正解請求 ${m.request} 不在選項裡`);
    if (m.twist && (m.flags.length || m.jury))
      errors.push(`動議 ${m.id} 有對方反擊，旗標與陪審團效果要寫在反擊選項裡`);
    const out = [...m.gives, ...(m.twist?.options.flatMap((o) => o.gives) ?? [])];
    for (const g of out) if (!cards.has(g)) errors.push(`動議 ${m.id} 給了不存在的卡片 ${g}`);
  }

  // 開示：請求 id 不重複，涵蓋的文件都要是這一幕的卡片。
  const rids = new Set<string>();
  for (const r of s.discovery) {
    if (rids.has(r.id)) errors.push(`桌面 ${s.id} 的開示請求 id 重複：${r.id}`);
    rids.add(r.id);
    for (const c of r.cards)
      if (!cards.has(c)) errors.push(`開示請求 ${r.id} 涵蓋了不存在的卡片 ${c}`);
    for (const u of r.unlock)
      if (!reachable.has(u)) errors.push(`開示請求 ${r.id} 的出現條件 ${u} 玩家拿不到`);
  }

  // 連線：兩張卡都要存在（證據或論點），id 不能和卡片撞名。
  const sceneArgs = new Set(s.questions.map((q) => q.argument.id));
  const lids = new Set<string>();
  for (const l of s.links) {
    if (lids.has(l.id) || cards.has(l.id)) errors.push(`桌面 ${s.id} 的連線 id 重複：${l.id}`);
    lids.add(l.id);
    for (const c of [...l.cards, ...Object.values(l.accept).flat()])
      if (!cards.has(c) && !args.has(c) && !sceneArgs.has(c) && !available.has(c))
        errors.push(`連線 ${l.id} 用了不存在的卡片 ${c}`);
    if (!unlocked.links.has(l.id))
      for (const c of l.cards)
        if (!reachable.has(c)) errors.push(`連線 ${l.id} 需要玩家拿不到的 ${c}`);
  }

  // 可解：每個疑問的正解都是拿得到的發現或論點（第二步不直接放證據）。
  const qids = new Set<string>();
  for (const q of s.questions) {
    if (qids.has(q.id)) errors.push(`桌面 ${s.id} 的疑問 id 重複：${q.id}`);
    qids.add(q.id);
    for (const id of [...q.answer, ...Object.values(q.accept).flat()])
      if (!lids.has(id) && !args.has(id) && !sceneArgs.has(id))
        errors.push(`疑問 ${q.id} 的正解 ${id} 不是發現也不是論點`);
    if (!unlocked.questions.has(q.id))
      for (const id of q.answer)
        if (!reachable.has(id)) errors.push(`疑問 ${q.id} 的正解需要玩家拿不到的 ${id}`);
    // 顯示條件：每一項都要存在，而且玩家拿得到（不能卡在自己或彼此的論點上）。
    for (const id of q.unlock) {
      if (!cards.has(id) && !lids.has(id) && !sceneArgs.has(id) && !available.has(id))
        errors.push(`疑問 ${q.id} 的顯示條件用了不存在的 ${id}`);
      else if (!reachable.has(id)) errors.push(`疑問 ${q.id} 的顯示條件需要玩家拿不到的 ${id}`);
    }
    args.add(q.argument.id);
    available.add(q.argument.id);
  }
  if (!s.questions.some((q) => q.id === s.goal))
    errors.push(`桌面 ${s.id} 的過關疑問 ${s.goal} 不存在`);

  // 工時：關鍵路徑（過關疑問的正解需要的委託＋提交）不超過預算的 60%。
  let keyHours = 0;
  const goal = s.questions.find((q) => q.id === s.goal);
  if (goal) {
    const need = goal.answer.flatMap((id) => s.links.find((l) => l.id === id)?.cards ?? [id]);
    for (const j of s.jobs) if (j.gives.some((g) => need.includes(g))) keyHours += j.cost;
    keyHours += 1;
    if (keyHours > s.hours * 0.6)
      errors.push(`桌面 ${s.id} 的關鍵路徑要 ${keyHours} 工時，超過預算 ${s.hours} 的 60%`);
  }

  for (const c of s.cards) available.add(c.id);
}

function trialErrors(s: TrialScene, available: Set<string>, args: Set<string>, errors: string[]) {
  if (s.jurors.filter((j) => j.foreperson).length !== 1)
    errors.push(`法庭 ${s.id} 的陪審長必須剛好一位`);
  const jids = new Set<string>();
  for (const j of s.jurors) {
    if (jids.has(j.id)) errors.push(`法庭 ${s.id} 的陪審員 id 重複：${j.id}`);
    jids.add(j.id);
  }
  // 異議教學：每集至少 3 個明顯的可異議問題。
  const objectionable = s.witness.direct.filter((d) => d.objection).length;
  if (objectionable < 3)
    errors.push(`法庭 ${s.id} 只有 ${objectionable} 個可異議的問題，至少要 3 個`);

  for (const c of s.witness.claims) {
    if (!args.has(c.argument)) errors.push(`對質 ${c.id} 需要的論點 ${c.argument} 沒有人產得出來`);
    if (!available.has(c.needs)) errors.push(`對質 ${c.id} 的鋪陳需要玩家拿不到的卡片 ${c.needs}`);
    if (c.anchor && !available.has(c.anchor))
      errors.push(`對質 ${c.id} 說可以用 ${c.anchor} 跳過鎖定，但沒有任何一幕產得出來`);
    // 底牌反擊要破解得了，否則洩漏一次就永遠減半。
    if (c.counter) {
      if (!available.has(c.counter.needs))
        errors.push(`對質 ${c.id} 的反擊要用 ${c.counter.needs} 破解，但玩家拿不到`);
      if (!args.has(c.counter.argument))
        errors.push(`對質 ${c.id} 的反擊針對的論點 ${c.counter.argument} 沒有人產得出來`);
    }
  }
  if (s.fifth) {
    if (!args.has(s.fifth.argument))
      errors.push(`法庭 ${s.id} 的緘默權結局要出示 ${s.fifth.argument}，但沒有人產得出來`);
    if (s.fifth.needs > s.witness.claims.length)
      errors.push(`法庭 ${s.id} 的緘默權結局要 ${s.fifth.needs} 次彈劾，多於可拆的說法數`);
  }
}

function depoErrors(
  s: DepositionScene,
  available: Set<string>,
  args: Set<string>,
  errors: string[],
) {
  if (s.side === 'theirs') {
    // 對方主導：要有題目，而且有該異議的和不該異議的，才是在練判斷。
    if (!s.script.length) errors.push(`錄取 ${s.id} 是對方主導，卻沒有任何問題`);
    const sids = new Set<string>();
    for (const q of s.script) {
      if (sids.has(q.id)) errors.push(`錄取 ${s.id} 的問題 id 重複：${q.id}`);
      sids.add(q.id);
      q.gives.forEach((g) => available.add(g));
      q.missed.gives.forEach((g) => available.add(g));
      if (q.anchors) available.add(q.anchors);
      if (!q.objection && (q.missed.gives.length || q.missed.flags.length))
        errors.push(`錄取 ${s.id} 的問題 ${q.id} 沒有該異議的毛病，missed 永遠不會生效`);
    }
    if (s.script.length && !s.script.some((q) => q.objection))
      errors.push(`錄取 ${s.id} 沒有任何該異議的問題`);
    if (s.script.length && !s.script.some((q) => !q.objection))
      errors.push(`錄取 ${s.id} 沒有任何不該異議的問題`);
    return;
  }
  if (!s.topics.length) errors.push(`錄取 ${s.id} 沒有任何話題`);
  const qs = s.topics.flatMap((t) => t.questions);
  // 額度要真的是取捨：問題必須比額度多，否則玩家可以全問。
  if (qs.length <= s.budget)
    errors.push(`錄取 ${s.id} 只有 ${qs.length} 個問題，沒有多於 ${s.budget} 個提問額度`);
  const ids = new Set<string>();
  for (const q of qs) {
    if (ids.has(q.id)) errors.push(`錄取 ${s.id} 的問題 id 重複：${q.id}`);
    ids.add(q.id);
    for (const t of q.tips)
      if (!args.has(t)) errors.push(`錄取 ${s.id} 的底牌問題 ${q.id} 指到不存在的論點 ${t}`);
    q.gives.forEach((g) => available.add(g));
    if (q.anchors) available.add(q.anchors);
  }
  // 教學要成立：至少要有一個定錨問題，和一個會洩底的底牌問題。
  if (!qs.some((q) => q.anchors)) errors.push(`錄取 ${s.id} 沒有任何可以定錨的問題`);
  if (!qs.some((q) => q.tips.length)) errors.push(`錄取 ${s.id} 沒有任何底牌問題`);
}

function negoErrors(
  s: NegotiationScene,
  available: Set<string>,
  _args: Set<string>,
  errors: string[],
) {
  const sorted = [...s.offers].sort((a, b) => b.min - a.min);
  if (sorted[sorted.length - 1].min !== 0) errors.push(`談判 ${s.id} 沒有信心歸零時的底線條件`);
  for (const b of s.bluffs) {
    for (const n of b.needs)
      if (!available.has(n)) errors.push(`談判 ${s.id} 的虛張聲勢 ${b.id} 指到不存在的證據 ${n}`);
  }
  for (const d of s.disclosed)
    if (!available.has(d)) errors.push(`談判 ${s.id} 開示了不存在的證據 ${d}`);
  // 授權上限：每個條件都要有金額，否則上限比不出來。
  if (s.authority)
    for (const o of s.offers)
      if (o.amount === undefined) errors.push(`談判 ${s.id} 有授權上限，條件 ${o.id} 卻沒寫金額`);
  if (!s.authority && s.offers.some((o) => o.terms))
    errors.push(`談判 ${s.id} 的條件附帶條款，但沒有授權設定可以請示`);
}

function voirDireErrors(s: VoirDireScene, errors: string[]) {
  const ids = new Set<string>();
  for (const c of s.candidates) {
    if (ids.has(c.id)) errors.push(`遴選 ${s.id} 的候選人 id 重複：${c.id}`);
    ids.add(c.id);
  }
  // 玩家和檢方各砍 peremptories 位，有因迴避的人也全被剔除，位子仍要補得滿。
  const worst =
    s.candidates.length - s.peremptories * 2 - s.candidates.filter((c) => c.cause).length;
  if (worst < s.seats)
    errors.push(
      `遴選 ${s.id} 只有 ${s.candidates.length} 位候選人，兩造砍完、有因迴避也剔除後就補不滿 ${s.seats} 個位子`,
    );
  // 有因迴避要教得起來：至少要有一位問了就會自己講出偏見的人。
  if (!s.candidates.some((c) => c.cause)) errors.push(`遴選 ${s.id} 沒有可以有因迴避的候選人`);
  if (s.questions >= s.candidates.length)
    errors.push(`遴選 ${s.id} 的提問次數 ${s.questions} 不少於候選人數，問了等於沒有取捨`);
}

/** 案件理論（企劃書 6.9.2、14 節第 7 條）：需要的論點產得出來，每個承諾都兌現得了。 */
function theoryErrors(s: TheoryScene, args: Set<string>, e: Episode, errors: string[]) {
  const impeachable = new Set(
    e.scenes.flatMap((x) =>
      x.type === 'trial'
        ? [...x.witness.claims.map((c) => c.argument), ...(x.fifth ? [x.fifth.argument] : [])]
        : [],
    ),
  );
  const tids = new Set<string>();
  const pids = new Set<string>();
  for (const t of s.theories) {
    if (tids.has(t.id)) errors.push(`案件理論 id 重複：${t.id}`);
    tids.add(t.id);
    for (const n of t.needs)
      if (!args.has(n)) errors.push(`案件理論 ${t.id} 需要的論點 ${n} 沒有人產得出來`);
    for (const p of t.promises) {
      if (pids.has(p.id)) errors.push(`承諾 id 重複：${p.id}`);
      pids.add(p.id);
      if (!t.needs.includes(p.argument))
        errors.push(`承諾 ${p.id} 靠 ${p.argument} 兌現，但理論 ${t.id} 不要求這個論點`);
      if (!impeachable.has(p.argument))
        errors.push(`承諾 ${p.id} 的論點 ${p.argument} 在庭上沒有任何地方可以兌現`);
    }
  }
  const after = e.scenes.slice(e.scenes.indexOf(s) + 1);
  const firstTrial = e.scenes.findIndex((x) => x.type === 'trial');
  if (firstTrial >= 0 && e.scenes.indexOf(s) > firstTrial)
    errors.push(`案件理論 ${s.id} 必須在第一場庭審之前`);
  if (!after.some((x) => x.type === 'opening'))
    errors.push(`案件理論 ${s.id} 之後沒有開場陳述，承諾無處可許`);
}

/** 開場陳述一定要有案件理論在前面，而且在庭審之前。 */
function openingErrors(e: Episode, errors: string[]) {
  const o = e.scenes.findIndex((x) => x.type === 'opening');
  if (o < 0) return;
  const t = e.scenes.findIndex((x) => x.type === 'theory');
  if (t < 0 || t > o) errors.push('開場陳述前面沒有案件理論');
  const firstTrial = e.scenes.findIndex((x) => x.type === 'trial');
  if (firstTrial >= 0 && o > firstTrial) errors.push('開場陳述必須在第一場庭審之前');
}

/** 辯方證人（企劃書 6.9.6）：要接在庭審之後，才有心證可以接；問題夠問，選項不重複。 */
function defenseErrors(s: DefenseScene, e: Episode, errors: string[]) {
  const at = e.scenes.indexOf(s);
  if (!e.scenes.slice(0, at).some((x) => x.type === 'trial'))
    errors.push(`辯方證人 ${s.id} 前面沒有庭審，沒有心證可以接`);
  if (s.asks > s.questions.length)
    errors.push(`辯方證人 ${s.id} 最多問 ${s.asks} 題，但只有 ${s.questions.length} 題可問`);
  const oids = new Set<string>();
  for (const o of s.prep.options) {
    if (oids.has(o.id)) errors.push(`辯方證人 ${s.id} 的準備選項 id 重複：${o.id}`);
    oids.add(o.id);
  }
  const known = new Set(
    e.scenes.flatMap((x) =>
      x.type === 'desk'
        ? [...x.cards.map((c) => c.id), ...x.questions.map((q) => q.argument.id)]
        : [],
    ),
  );
  const qids = new Set<string>();
  for (const q of s.questions) {
    if (qids.has(q.id)) errors.push(`辯方證人 ${s.id} 的問題 id 重複：${q.id}`);
    qids.add(q.id);
    for (const n of q.needs ?? [])
      if (!known.has(n)) errors.push(`辯方證人 ${s.id} 的問題 ${q.id} 需要不存在的卡片：${n}`);
  }
  // 教過證人要有意義：至少有一題是被教過的措辭。
  if (s.prep.options.some((o) => o.coached) && !s.questions.some((q) => q.rehearsed))
    errors.push(`辯方證人 ${s.id} 有「教證人」選項，但沒有任何 rehearsed 問題`);
  const closeAt = e.scenes.findIndex((x) => x.type === 'closing');
  if (closeAt >= 0 && at > closeAt) errors.push(`辯方證人 ${s.id} 必須在結辯之前`);
}

/** 判決、收場、懲罰性賠償要等結辯之後才知道。 */
const before = (w: When) => !!(w.verdict || w.outcome || w.deal || w.punitive !== undefined);

/**
 * Bates 與出處（設定集第 9 章 :71、:117；設計師 bates-review.md）：
 * - 整集的 Bates 跨前綴一起查重複（卡片、batesIf 每條分支、照片沖印本、錄影）。
 * - 每張紙至少有一項出處：Bates、頁行、案號收文、或陳述的時間與製作人。
 * - 錄取時鎖成宣誓陳述或問出來的卡片，頁行要和那一題寫的一樣（勘誤表才找得到那一行）。
 */
function batesErrors(e: Episode, errors: string[]) {
  const seen = new Map<string, string>();
  const claim = (bates: string, where: string) => {
    const was = seen.get(bates);
    if (was) errors.push(`Bates ${bates} 重複：${was}、${where}`);
    else seen.set(bates, where);
  };
  const cards = new Map<string, Card>();
  for (const s of e.scenes) if (s.type === 'desk') for (const c of s.cards) cards.set(c.id, c);
  for (const c of cards.values()) {
    if (c.bates) claim(c.bates, `卡片 ${c.id}`);
    c.batesIf?.forEach((b, i) => claim(b.bates, `卡片 ${c.id} 的 batesIf 第 ${i + 1} 筆`));
    if (c.photo?.bates) claim(c.photo.bates, `卡片 ${c.id} 的照片`);
    if (
      c.kind !== '論點' &&
      !(c.bates || c.batesIf || c.photo?.bates || c.cite || c.filed || c.taken)
    )
      errors.push(`卡片 ${c.id} 沒有出處：要寫 bates、cite、filed 或 taken 其中一項`);
  }
  for (const s of e.scenes) {
    if (s.type !== 'deposition') continue;
    if (s.video) claim(s.video.bates, `證詞錄取 ${s.id} 的錄影`);
    for (const q of s.script) {
      if (!q.cite) continue;
      for (const id of [...(q.anchors ? [q.anchors] : []), ...q.gives]) {
        const c = cards.get(id);
        if (c?.cite && c.cite !== q.cite)
          errors.push(
            `卡片 ${id} 的頁行 ${c.cite} 和證詞錄取 ${s.id} 第 ${q.id} 題的 ${q.cite} 對不上`,
          );
      }
    }
  }
}

/** 保管鏈的進度條件：引用的東西要存在；證物在開庭前就經手完了，不能依判決或結果分支。 */
function custodyErrors(e: Episode, errors: string[]) {
  const { check } = whenChecker(e, errors);
  const seen = new Set<string>();
  for (const s of e.scenes) {
    if (s.type !== 'desk') continue;
    for (const c of s.cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      c.bag?.custody.forEach((h, i) => {
        if (!h.when) return;
        const where = `卡片 ${c.id} 的保管鏈第 ${i + 1} 行`;
        check(h.when, where);
        if (before(h.when)) errors.push(`${where} 依判決或結果分支，證物在開庭前就經手完了`);
      });
    }
  }
}

/** 集層級 effects：條件在開庭或調解開始時判斷，不能依判決分支。 */
function effectErrors(e: Episode, errors: string[]) {
  e.effects.forEach((x, i) => {
    if (before(x.when)) errors.push(`effects 第 ${i + 1} 項依判決或結果分支，開庭前還不知道`);
    if (!x.jury && !x.confidence && !x.trust && !x.flags.length)
      errors.push(`effects 第 ${i + 1} 項沒有任何效果`);
  });
}

/** 分支條件引用的理論、協商條件、卡片、論點都要存在。 */
function whenChecker(e: Episode, errors: string[]) {
  const theories = new Set(
    e.scenes.flatMap((x) => (x.type === 'theory' ? x.theories.map((t) => t.id) : [])),
  );
  const known = new Set(
    e.scenes.flatMap((x) =>
      x.type === 'desk'
        ? [...x.cards.map((c) => c.id), ...x.questions.map((q) => q.argument.id)]
        : [],
    ),
  );
  const offers = new Set(
    e.scenes.flatMap((x) => (x.type === 'negotiation' ? x.offers.map((o) => o.id) : [])),
  );
  const check = (w: When | undefined, where: string) => {
    for (const t of w?.theory ?? [])
      if (!theories.has(t)) errors.push(`${where} 的條件引用了不存在的理論：${t}`);
    for (const d of w?.deal ?? [])
      if (!offers.has(d)) errors.push(`${where} 的條件引用了不存在的協商條件：${d}`);
    for (const c of w?.cards ?? [])
      if (!known.has(c)) errors.push(`${where} 的條件引用了不存在的卡片：${c}`);
    for (const c of w?.presented ?? [])
      if (!known.has(c)) errors.push(`${where} 的條件引用了不存在的論點：${c}`);
  };
  return { check, theories, known };
}

/** 分支條件：引用的理論要存在；結局 id 不重複；判決類的條件只能用在結辯之後。 */
function branchErrors(s: Episode['scenes'][number], e: Episode, errors: string[]) {
  const { check, theories, known } = whenChecker(e, errors);
  if (s.type === 'desk')
    for (const c of s.cards)
      for (const b of c.batesIf ?? []) {
        check(b.when, `卡片 ${c.id} 的 batesIf`);
        if (before(b.when)) errors.push(`卡片 ${c.id} 的 batesIf 依判決或結果分支`);
      }
  if (s.type === 'card')
    for (const f of s.filings ?? []) {
      check(f.when, `幕卡 ${s.id} 的登錄表行 ${f.date}`);
      if (f.when && before(f.when))
        errors.push(`幕卡 ${s.id} 的登錄表行 ${f.date} 依判決或結果分支，請寫進 disposition`);
    }
  if (s.type === 'trial' && s.fifth?.theory && !theories.has(s.fifth.theory))
    errors.push(`法庭 ${s.id} 的緘默權撤訴條件引用了不存在的理論：${s.fifth.theory}`);
  if (s.type === 'theory')
    for (const t of s.theories)
      for (const c of t.ethicsIf?.has ?? [])
        if (!known.has(c)) errors.push(`理論 ${t.id} 的 ethicsIf 引用了不存在的卡片：${c}`);
  if (s.type === 'defense') {
    for (const q of s.questions) {
      check(q.when, `辯方證人 ${s.id} 的問題 ${q.id}`);
      if (q.when && before(q.when)) errors.push(`辯方證人 ${s.id} 的問題 ${q.id} 依判決或結果分支`);
      for (const c of q.ethicsIf?.has ?? [])
        if (!known.has(c))
          errors.push(`辯方證人 ${s.id} 的問題 ${q.id} 的 ethicsIf 引用了不存在的卡片：${c}`);
    }
    s.cross.forEach((x, i) => {
      check(x.when, `辯方證人 ${s.id} 的反詰問追加第 ${i + 1} 題`);
      for (const [k, ids] of [
        ['unlessAsked', x.unlessAsked ?? []],
        ['ifAsked', x.ifAsked ?? []],
      ] as const)
        for (const q of ids)
          if (!s.questions.some((y) => y.id === q))
            errors.push(
              `辯方證人 ${s.id} 的反詰問追加第 ${i + 1} 題 ${k} 引用了不存在的題目：${q}`,
            );
    });
    for (const o of s.prep.options) check(o.when, `辯方證人 ${s.id} 的準備選項 ${o.id}`);
    // 條件全不符時沒有準備方式可選，玩家會卡住。
    if (s.prep.options.every((o) => o.when))
      errors.push(`辯方證人 ${s.id} 的準備選項全部有條件，可能一個都不出現`);
  }
  if (s.type === 'desk')
    for (const r of s.discovery) {
      check(r.waived, `開示請求 ${r.id} 的 waived`);
      for (const a of r.exposes)
        if (!known.has(a)) errors.push(`開示請求 ${r.id} 的 exposes 引用了不存在的論點：${a}`);
    }
  if ('when' in s && s.when) {
    check(s.when, `場景 ${s.id}`);
    const closeAt = e.scenes.findIndex((x) => x.type === 'closing');
    if (s.when.verdict && (closeAt < 0 || e.scenes.indexOf(s) < closeAt))
      errors.push(`場景 ${s.id} 依判決分支，但它在結辯之前`);
  }
  if (s.type === 'dialogue')
    s.steps.forEach((step, i) => {
      if (step.do !== 'choose') return;
      step.options.forEach((o, j) => check(o.when, `場景 ${s.id} 第 ${i + 1} 步選項 ${j + 1}`));
      // 至少留一個無條件的選項，否則條件全不符時玩家會卡住。
      if (step.options.every((o) => o.when))
        errors.push(`場景 ${s.id} 第 ${i + 1} 步的選項全部有條件，可能一個都不出現`);
    });
  if (s.type === 'closing') {
    const ids = new Set<string>();
    for (const x of s.endings) {
      if (ids.has(x.id)) errors.push(`結辯 ${s.id} 的結局 id 重複：${x.id}`);
      ids.add(x.id);
      check(x.when, `結辯 ${s.id} 的結局 ${x.id}`);
    }
  }
}
