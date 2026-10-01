import { create } from 'zustand';

/**
 * 電腦版的證據欄可以直接點卡片放上連線台。
 * 連線區開著時登記「哪些卡可以挑、已經挑了哪些、點了做什麼」，離開就清掉。
 */
export const useCardPick = create<{
  pool: string[];
  on: string[];
  pick?: (id: string) => void;
}>(() => ({ pool: [], on: [] }));
