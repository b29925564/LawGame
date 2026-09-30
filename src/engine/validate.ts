import type { CaseData } from './schema';

/** 劇本邏輯檢查（企劃書 v2.0 第 14 節中原型用得到的部分）。 */
export function validateCase(c: CaseData): string[] {
  const errors: string[] = [];
  const dupes = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`${kind} id 重複：${i}`);
      seen.add(i);
    }
  };
  const args = c.questions.map((q) => q.argument);
  dupes(
    '卡片',
    c.cards.map((x) => x.id),
  );
  dupes(
    '疑問',
    c.questions.map((x) => x.id),
  );
  dupes(
    '論點',
    args.map((x) => x.id),
  );
  dupes(
    '陪審員',
    c.jurors.map((x) => x.id),
  );
  dupes(
    '證詞',
    c.witness.claims.map((x) => x.id),
  );

  const cards = new Set(c.cards.map((x) => x.id));
  // 可解：每個疑問的正解卡片都存在。
  for (const q of c.questions) {
    for (const id of q.answer)
      if (!cards.has(id)) errors.push(`疑問 ${q.id} 的正解引用了不存在的卡片 ${id}`);
  }
  // 工時：全部疑問一次答對所需工時 ≤ 預算的 60%。
  if (c.questions.length > c.hours * 0.6 + 1e-9)
    errors.push(`全部疑問需要 ${c.questions.length} 工時，超過預算 ${c.hours} 的 60%`);

  // 鋪陳可達：每個對質都有論點，且至少一個鋪陳時機。
  const argIds = new Set(args.map((a) => a.id));
  const expertAdmits = new Set(c.expert.questions.map((q) => q.admits).filter(Boolean));
  for (const cl of c.witness.claims) {
    if (!argIds.has(cl.argument)) errors.push(`證詞 ${cl.id} 需要不存在的論點 ${cl.argument}`);
    if (!cards.has(cl.needs)) errors.push(`證詞 ${cl.id} 的鋪陳引用了不存在的卡片 ${cl.needs}`);
    const chances = 1 + (expertAdmits.has(cl.needs) ? 1 : 0);
    if (chances < 1) errors.push(`證詞 ${cl.id} 沒有鋪陳時機`);
  }
  for (const id of expertAdmits)
    if (!cards.has(id!)) errors.push(`專家證人承認了不存在的卡片 ${id}`);

  if (c.jurors.filter((j) => j.foreperson).length !== 1) errors.push('陪審長必須剛好一位');
  return errors;
}
