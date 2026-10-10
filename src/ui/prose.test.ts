import { describe, expect, it } from 'vitest';
import { episodes } from '../content';
import { proseUnits } from './lineUnits';

describe('紙面內文的換行單位（設計師 P2-6 r2 第 12 條）', () => {
  it('詞與譯名不拆開：律師事務所、智慧手錶、惠特洛克・海爾', () => {
    const u = proseUnits(
      '起訴書提出：二級謀殺一罪。被告在押；惠特洛克・海爾律師事務所具狀為被告辯護人。',
    );
    expect(u).toContain('惠特洛克・海爾律師事務所');
    expect(proseUnits('執行助理蘇菲・馬丁內斯作證，說明當晚的門禁紀錄。')).toContain(
      '蘇菲・馬丁內斯',
    );
    expect(
      proseUnits('被告入所時扣押物品：手機 1 支、皮夾 1 個、智慧手錶 1 支。').join('|'),
    ).toMatch(/智慧手錶/);
  });

  it('標點跟前一個詞、開括號跟後一個詞，數字和量詞、No. 和號碼不拆', () => {
    const u = proseUnits('准辯方鑑識被告之智慧手錶（財物清單 No. 26-0315-088 項 3）。');
    for (const x of u.slice(1)) expect(x).not.toMatch(/^[，。、；：）]/);
    for (const x of u) expect(x).not.toMatch(/（$/);
    expect(u.join('|')).toContain('No. 26-0315-088');
    expect(proseUnits('手機 1 支、皮夾 1 個、錢包和鑰匙。')).toContain('1 支、');
    expect(proseUnits('心率在 22:24 急遽升高後歸零，之後再無讀數。')).toContain('在 22:24');
  });

  it('末行至少四個漢字；字一個不少', () => {
    for (const s of [
      '二十四工時。讀文件、擺卡片、和自己人講話都不花錢。',
      '被告委任惠特洛克・海爾律師事務所為訴訟代理人，具狀陳報。',
      '心率在 22:24 急遽升高後歸零，之後再無讀數。',
    ]) {
      const u = proseUnits(s);
      expect(u.join('')).toBe(s);
      expect(u.at(-1)!.replace(/[^\p{Script=Han}]/gu, '').length).toBeGreaterThanOrEqual(4);
    }
  });

  it('例外詞表：「腕上」「當庭」不拆（設計師 P2-6 r3 第 6 條）', () => {
    const wrist = proseUnits(
      '死者左腕配戴智慧手錶，錶帶完好，仍扣在腕上；背面有心率感測器，貼著皮膚。',
    );
    expect(wrist.some((x) => x.includes('腕上'))).toBe(true);
    const court = proseUnits('辯方聲請對手錶廠商核發文書傳票；本院當庭核發傳票 D-1。');
    expect(court.some((x) => x.includes('當庭'))).toBe(true);
    const pros = proseUnits('沒有警告就問話，問出來的話不能用。不提出的話，檢方開庭時會用它。');
    expect(pros.some((x) => x.includes('檢方'))).toBe(true);
  });

  it('沒有漢字的英文原樣不動', () => {
    expect(proseUnits('Indictment filed: one count of murder.')).toEqual([
      'Indictment filed: one count of murder.',
    ]);
  });

  it('人名不拆（#246 r8：「伊／森就叫了車」）：台詞說話人的名字每一段都是一個單位', () => {
    expect(proseUnits('22:33 手錶跳出死者帳號的訊息，22:34 伊森就叫了車。')).toContain('伊森');
    const who = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o))
        if (['who', 'owner', 'driver'].includes(k) && typeof v === 'string') who.add(v);
        else walk(v);
    };
    walk(Object.values(episodes));
    const split: string[] = [];
    for (const n of who)
      for (const part of n.split(/[・\s]/))
        if ([...part].length >= 2 && /^\p{Script=Han}+$/u.test(part))
          if (!proseUnits(`和${part}談過之後再說`).some((u) => u.includes(part))) split.push(part);
    expect([...new Set(split)]).toEqual([]);
  });

  it('開頭的「誰的說法：」整組不拆，斷在冒號後（#246 r8 邊緣卡標題）', () => {
    expect(proseUnits('伊森的說法：他先檢舉了沃斯')[0]).toBe('伊森的說法：');
    // 標籤後面短短的末行不併進標籤（窄卡上會整組超出卡邊）；標籤後一個字不自己掛一行。
    expect(proseUnits('伊森的說法：獎盃')).toEqual(['伊森的說法：', '獎盃']);
    expect(proseUnits('伊森的說法：他先檢舉了沃斯').slice(0, 2)).toEqual(['伊森的說法：', '他先']);
    expect(proseUnits('驗屍照片：死者的手錶')[0]).toBe('驗屍照片：');
    // 冒號太後面的不是標籤，照常斷。
    expect(proseUnits('被告委任惠特洛克・海爾律師事務所為訴訟代理人：具狀陳報。')[0]).not.toMatch(
      /：$/,
    );
  });
});
