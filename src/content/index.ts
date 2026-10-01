import type { Episode } from '../engine/episode/schema';
import type { CaseData } from '../engine/schema';
// 由 vite.config.ts 的 content 外掛在建置時解析與驗證。
import ep1Data from './ep1.yaml';
import protoData from './proto.yaml';

/** 原型（企劃書第 15 節）的單場劇本，垂直切片的庭審完成前保留在標題畫面。 */
export const cases = { proto: protoData as CaseData };

export const episodes = { ep1: ep1Data as Episode };
