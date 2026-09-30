import type { CaseData } from './schema';

/** 劇本邏輯檢查：引用存在、每個矛盾都有可取得的證據能破解、至少有一條通關路徑。 */
export function validateCase(c: CaseData): string[] {
  const errors: string[] = [];
  const dupes = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) errors.push(`${kind} id 重複：${i}`);
      seen.add(i);
    }
  };
  dupes(
    '角色',
    c.characters.map((x) => x.id),
  );
  dupes(
    '證據',
    c.evidence.map((x) => x.id),
  );
  dupes(
    '文件',
    c.documents.map((x) => x.id),
  );
  dupes(
    '證詞',
    c.trial.statements.map((x) => x.id),
  );

  const evidenceIds = new Set(c.evidence.map((e) => e.id));
  const obtainable = new Set<string>();
  for (const doc of c.documents) {
    for (const e of doc.evidence) {
      if (!evidenceIds.has(e)) errors.push(`文件 ${doc.id} 引用了不存在的證據 ${e}`);
      else obtainable.add(e);
    }
  }
  for (const e of evidenceIds) {
    if (!obtainable.has(e)) errors.push(`證據 ${e} 沒有任何文件可以取得`);
  }

  if (!c.characters.some((ch) => ch.id === c.trial.witness)) {
    errors.push(`證人 ${c.trial.witness} 不在角色清單中`);
  }

  const contradictions = c.trial.statements.filter((s) => s.contradiction);
  if (contradictions.length === 0) errors.push('審判沒有任何矛盾，無法勝訴');
  for (const s of contradictions) {
    const e = s.contradiction!.evidence;
    if (!obtainable.has(e)) errors.push(`證詞 ${s.id} 的矛盾需要證據 ${e}，但無法取得`);
  }
  return errors;
}
