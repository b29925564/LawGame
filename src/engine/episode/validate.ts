import type { DepositionScene, DeskScene, Episode, NegotiationScene, TrialScene } from './schema';

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
  }
  return errors;
}

function deskErrors(s: DeskScene, available: Set<string>, args: Set<string>, errors: string[]) {
  const cards = new Set(s.cards.map((c) => c.id));
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
    for (const q of s.questions)
      if (!unlocked.questions.has(q.id) && has(q.answer)) {
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
    if (!m.bases.includes(m.basis)) errors.push(`動議 ${m.id} 的正解理由 ${m.basis} 不在選項裡`);
    if (!m.requests.includes(m.request))
      errors.push(`動議 ${m.id} 的正解請求 ${m.request} 不在選項裡`);
    const out = [...m.gives, ...(m.twist?.options.flatMap((o) => o.gives) ?? [])];
    for (const g of out) if (!cards.has(g)) errors.push(`動議 ${m.id} 給了不存在的卡片 ${g}`);
  }

  // 可解：每個疑問的正解卡片都拿得到。
  const qids = new Set<string>();
  for (const q of s.questions) {
    if (qids.has(q.id)) errors.push(`桌面 ${s.id} 的疑問 id 重複：${q.id}`);
    qids.add(q.id);
    if (!unlocked.questions.has(q.id))
      for (const id of q.answer)
        if (!reachable.has(id)) errors.push(`疑問 ${q.id} 的正解需要玩家拿不到的卡片 ${id}`);
    args.add(q.argument.id);
    available.add(q.argument.id);
  }
  if (!s.questions.some((q) => q.id === s.goal))
    errors.push(`桌面 ${s.id} 的過關疑問 ${s.goal} 不存在`);

  // 工時：關鍵路徑（過關疑問的正解需要的委託＋提交）不超過預算的 60%。
  let keyHours = 0;
  const goal = s.questions.find((q) => q.id === s.goal);
  if (goal) {
    for (const j of s.jobs) if (j.gives.some((g) => goal.answer.includes(g))) keyHours += j.cost;
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
  }
}

function depoErrors(
  s: DepositionScene,
  available: Set<string>,
  args: Set<string>,
  errors: string[],
) {
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
    // 撐得起來的說法要真的撐得起來：需要的證據全在開示清單上才算可信。
    if (b.needs.every((n) => s.disclosed.includes(n)) === false && b.caught.length === 0)
      errors.push(`談判 ${s.id} 的虛張聲勢 ${b.id} 沒有被識破時的台詞`);
  }
  for (const d of s.disclosed)
    if (!available.has(d)) errors.push(`談判 ${s.id} 開示了不存在的證據 ${d}`);
}
