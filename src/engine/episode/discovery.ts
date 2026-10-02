import type { DeskScene, Line } from './schema';
import { heldCards, type DeskState } from './desk';

/** 玩家對一項開示請求的回應。 */
export type Response = 'produce' | 'privilege' | 'overbroad';

/**
 * 回應的結果：
 * produced 交出；withheld 特權成立；strained 特權勉強成立，法官記一筆；
 * concealed 沒有理由硬藏（當下看起來過了，之後會被揭穿）；
 * narrowed 範圍過廣成立，不必交；compelled 範圍過廣不成立，被裁定照交，法官記一筆。
 */
export type Result = 'produced' | 'withheld' | 'strained' | 'concealed' | 'narrowed' | 'compelled';

/** 每種結果開庭時讓法官少幾點耐心。硬藏在庭上被揭穿，代價最重。 */
export const PATIENCE_COST: Record<Result, number> = {
  produced: 0,
  withheld: 0,
  narrowed: 0,
  strained: 1,
  compelled: 1,
  concealed: 2,
};

/** 硬藏寫進倫理帳本的那一筆。 */
export const CONCEALED = 'concealed-evidence';

type Request = DeskScene['discovery'][number];

export function resultOf(r: Request, resp: Response): Result {
  if (resp === 'produce') return 'produced';
  if (resp === 'overbroad') return r.overbroad ? 'narrowed' : 'compelled';
  return r.privilege === 'valid' ? 'withheld' : r.privilege === 'weak' ? 'strained' : 'concealed';
}

export const answered = (st: DeskState) => st.discovery ?? {};

/** 請求看得到了嗎：unlock 的卡片或發現全部到手（含前面幕帶進來的）。 */
export function requestOpen(s: DeskScene, st: DeskState, r: Request, carried: string[] = []) {
  if (!r.unlock.length) return true;
  const have = new Set([...heldCards(s, st, carried), ...st.found]);
  return r.unlock.every((id) => have.has(id));
}

/** 現在看得到的請求，照劇本順序。 */
export const openRequests = (s: DeskScene, st: DeskState, carried: string[] = []) =>
  s.discovery.filter((r) => requestOpen(s, st, r, carried));

/** 看得到但還沒回應的請求數。 */
export const unanswered = (s: DeskScene, st: DeskState, carried: string[] = []) =>
  openRequests(s, st, carried).filter((r) => !answered(st)[r.id]).length;

/** 對方最後拿到的文件：交出的，和被裁定照交的。 */
export function handedOver(s: DeskScene, st: DeskState): string[] {
  const a = answered(st);
  return s.discovery
    .filter((r) => a[r.id] === 'produced' || a[r.id] === 'compelled')
    .flatMap((r) => r.cards);
}

/** 回應一項請求。送出就定案，不能改。結果寫成旗標 discovery:<id>:<結果>，劇本用 when.flags 接。 */
export function respond(
  s: DeskScene,
  st: DeskState,
  id: string,
  resp: Response,
  carried: string[] = [],
): DeskState {
  const r = s.discovery.find((x) => x.id === id);
  if (!r || answered(st)[id] || !requestOpen(s, st, r, carried)) return st;
  const result = resultOf(r, resp);
  const lines: Line[] = r.lines[result] ?? [];
  return {
    ...st,
    discovery: { ...answered(st), [id]: result },
    flags: [...new Set([...st.flags, `discovery:${id}:${result}`])],
    report: lines.length ? lines : st.report,
  };
}

/** 看得到的請求都回應了才能結束調查（開示有期限）。還沒出現的不擋路。 */
export const allAnswered = (s: DeskScene, st: DeskState, carried: string[] = []) =>
  unanswered(s, st, carried) === 0;

/** 開庭時法官因為開示少掉的耐心。 */
export function patienceCost(st: DeskState): number {
  return Object.values(answered(st)).reduce((n, r) => n + PATIENCE_COST[r], 0);
}
