import type { DeskScene, Episode, TrialScene } from './schema';

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
  for (const id of available)
    if (!cards.has(id)) errors.push(`桌面 ${s.id} 少了前面幕帶進來的卡片定義 ${id}`);

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
  for (const j of s.jobs) {
    for (const n of j.needs)
      if (!reachable.has(n)) errors.push(`委託 ${j.id} 需要玩家拿不到的卡片 ${n}`);
    for (const g of j.gives) {
      if (!cards.has(g)) errors.push(`委託 ${j.id} 給了不存在的卡片 ${g}`);
      reachable.add(g);
    }
  }

  // 可解：每個疑問的正解卡片都拿得到。
  let keyHours = 0;
  const qids = new Set<string>();
  for (const q of s.questions) {
    if (qids.has(q.id)) errors.push(`桌面 ${s.id} 的疑問 id 重複：${q.id}`);
    qids.add(q.id);
    for (const id of q.answer)
      if (!reachable.has(id)) errors.push(`疑問 ${q.id} 的正解需要玩家拿不到的卡片 ${id}`);
    args.add(q.argument.id);
    available.add(q.argument.id);
  }
  if (!s.questions.some((q) => q.id === s.goal))
    errors.push(`桌面 ${s.id} 的過關疑問 ${s.goal} 不存在`);

  // 工時：關鍵路徑（過關疑問的正解需要的委託＋提交）不超過預算的 60%。
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
