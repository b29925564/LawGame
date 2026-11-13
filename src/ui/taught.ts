import { useEffect } from 'react';
import { useSettings } from '../engine/settings';

/**
 * 教學以外不再教機制（使用者 2026-11-13：「需要在新手教學外再用敘述性提示教遊戲機制的都不是好的遊戲」）。
 * 介面上的操作說明只陪玩家做第一次：做過一次（done 變成 true）就記在瀏覽器裡，之後每一集都不再出現，
 * 機制靠介面本身的回饋說話。和片頭的 introSeen 一樣存在設定裡，不進存檔。
 */
export type TaughtKey =
  | 'link' // 證據板：把兩張卡連起來得到發現
  | 'answer' // 證據板：把發現放進答案、確認疑問
  | 'timeline' // 時間軸：點卡放上去
  | 'press' // 訪談：施壓
  | 'object' // 法庭：主詰問時提異議
  | 'present' // 法庭：交互詰問時出示論點
  | 'recess' // 法庭：按休庭看結果
  | 'theory' // 案件理論：比較後定案
  | 'voirdire'; // 陪審團遴選：點名單看資料

/** 這個說明還要不要出現；done 一變成 true 就記下來，從此不再出現。 */
export function useTaught(key: TaughtKey, done = false): boolean {
  const taught = useSettings((s) => !!s.taught?.[key]);
  useEffect(() => {
    if (done && !taught) teach(key);
  }, [done, taught, key]);
  return !taught;
}

/** 做過了（在事件處理裡直接記，不等下一次 render）。 */
export function teach(key: TaughtKey) {
  const { taught = {}, set } = useSettings.getState();
  if (!taught[key]) set({ taught: { ...taught, [key]: true } });
}
