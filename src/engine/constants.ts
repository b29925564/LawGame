// 不依賴 zod 的常數，讓介面引用時不把 zod 打包進瀏覽器。
export const tags = ['邏輯', '情感', '權威', '程序'] as const;
export type Tag = (typeof tags)[number];
export const relations = ['矛盾', '支持', '縮小範圍', '說明動機', '說明機會'] as const;
export type Relation = (typeof relations)[number];
