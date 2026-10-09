import * as branch from './branch';
import type { Card } from './schema';

export type Bag = NonNullable<Card['bag']>;
export type Handoff = Bag['custody'][number];

/**
 * 證物袋上的保管鏈，照劇情進度（設計審查 #233 r1）：寫了 when 的那一行，條件成立才算發生。
 * 保管鏈不能斷手，所以第一個還沒發生的那一行之後，每一行都還沒發生；
 * 介面把 done 為 false 的行畫成黑條「尚未發生」，和案卷登錄表一樣。
 */
export function custodyRows(bag: Bag, c: branch.BranchContext): { row: Handoff; done: boolean }[] {
  let open = true;
  return bag.custody.map((row) => {
    open = open && branch.matches(row.when, c);
    return { row, done: open };
  });
}
