import type { Episode } from './schema';

/** 集數劇本的邏輯檢查（企劃書 v2.0 第 14 節中目前用得到的部分）。 */
export function validateEpisode(e: Episode): string[] {
  const errors: string[] = [];
  const sceneIds = new Set<string>();
  for (const s of e.scenes) {
    if (sceneIds.has(s.id)) errors.push(`場景 id 重複：${s.id}`);
    sceneIds.add(s.id);
    if (s.type !== 'phone') continue;

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
  return errors;
}
