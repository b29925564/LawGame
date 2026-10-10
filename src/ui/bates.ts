/**
 * Bates（設定集第 9 章）：本所文件的前綴 WH-，加集數與六位數頁碼，Courier Prime 700。
 * 全域唯一的頁碼歸遊戲系統（差距表 P2-1）；那之前沿用幕卡的裝飾性頁碼：每一場 13 頁、從 57 頁起。
 */
export const bates = (episode: number, page: number) =>
  `WH-E${String(episode).padStart(2, '0')}-${String(page).padStart(6, '0')}`;

/** 第 at 場（場景序）的頁碼。 */
export const pageAt = (at: number) => 57 + at * 13;
