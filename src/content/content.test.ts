import { describe, expect, it } from 'vitest';
import { matches, type BranchContext, type Verdict } from '../engine/episode/branch';
import { validateEpisode } from '../engine/episode/validate';
import { validateCase } from '../engine/validate';
import { cases, episodes } from './index';
import en1 from './en/ep1.yaml';
import en2 from './en/ep2.yaml';

describe('劇本驗證器', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateCase(c)).toEqual([]);
    });
  }
  for (const [name, e] of Object.entries(episodes)) {
    it(`${name} 通過邏輯檢查`, () => {
      expect(validateEpisode(e)).toEqual([]);
    });
  }
});

describe('心聲的新寫法', () => {
  const e = episodes[Object.keys(episodes)[0] as keyof typeof episodes];
  const withLine = (line: object) => ({
    ...e,
    scenes: [{ type: 'dialogue', id: 'x', act: '', steps: [{ do: 'say', ...line }] }, ...e.scenes],
  });
  const errs = (line: object) =>
    validateEpisode(withLine(line) as typeof e).filter((m) => m.startsWith('場景 x'));

  it('擋下「（心裡）」', () => {
    expect(errs({ who: '盧卡斯（心裡）', text: '嗯。' })).toHaveLength(1);
    expect(errs({ who: '盧卡斯', text: '（心裡）嗯。' })).toHaveLength(1);
  });
  it('beats 只能用在畫外字幕，記號和字幕不能混用', () => {
    expect(errs({ who: '盧卡斯', text: '', beats: [{ text: 'a' }] })).toHaveLength(1);
    expect(errs({ who: '盧卡斯', text: '', voice: 'off', mark: { kind: 'sticky' } })).toHaveLength(
      1,
    );
    expect(errs({ who: '盧卡斯', text: 'a', voice: 'off', beats: [{ text: 'a' }] })).toEqual([]);
  });
});

describe('卷宗元件資料（P2-6）', () => {
  const iso = (d: string) => d.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2');
  for (const [name, e] of Object.entries(episodes)) {
    it(`${name} 案卷登錄表的日期照卡的順序遞增`, () => {
      const dates = e.scenes.flatMap((s) =>
        s.type === 'card'
          ? [...(s.filings ?? []), ...(s.docket ? [s.docket] : [])].map((d) => iso(d.date))
          : [],
      );
      expect(dates.length).toBeGreaterThan(0);
      expect([...dates].sort()).toEqual(dates);
    });

    it(`${name} 每一種收場都有登錄表最後一行`, () => {
      const rows = e.disposition ?? [];
      const closing = e.scenes.find((s) => s.type === 'closing');
      const theories = e.scenes.flatMap((s) =>
        s.type === 'theory' ? s.theories.map((t) => t.id) : [],
      );
      const offers = e.scenes.flatMap((s) =>
        s.type === 'negotiation' ? s.offers.map((o) => o.id) : [],
      );
      const base = {
        verdict: null,
        outcome: null,
        deal: null,
        theory: null,
        flags: [],
        ethics: [],
        cards: [],
        presented: [],
      };
      const ctxs: BranchContext[] = [
        ...offers.map((deal) => ({ ...base, outcome: 'deal' as const, deal })),
        ...(e.scenes.some((s) => s.type === 'trial' && s.fifth)
          ? [{ ...base, outcome: 'dismissed' as const }]
          : []),
        ...Object.keys(closing?.type === 'closing' ? closing.verdicts : {}).flatMap((v) =>
          [null, ...theories].flatMap((theory) =>
            [false, true].map((punitive) => ({ ...base, verdict: v as Verdict, theory, punitive })),
          ),
        ),
      ];
      expect(ctxs.length).toBeGreaterThan(0);
      for (const c of ctxs)
        expect(
          rows.some((r) => matches(r.when, c)),
          JSON.stringify(c),
        ).toBe(true);
      const first = Math.min(
        ...e.scenes.flatMap((s) =>
          s.type === 'card' && s.docket ? [+iso(s.docket.date).replace(/-/g, '')] : [],
        ),
      );
      for (const r of rows) expect(+iso(r.date).replace(/-/g, '')).toBeGreaterThan(first);
    });
  }
});

describe('Bates（P2-1）', () => {
  it('內容裡寫的 Bates 跨兩集都不重複', () => {
    // 同一張卡會出現在好幾個桌面場（共用牌庫），以「集＋卡」為單位收一次。
    const owner = new Map<string, string>();
    const dup: string[] = [];
    const add = (b: string | undefined, who: string) => {
      if (!b) return;
      const prev = owner.get(b);
      if (prev && prev !== who) dup.push(`${b}: ${prev} / ${who}`);
      owner.set(b, who);
    };
    for (const [name, e] of Object.entries(episodes))
      for (const s of e.scenes) {
        if (s.type === 'desk')
          for (const c of s.cards) {
            add(c.bates, `${name}:${c.id}`);
            add(c.photo?.bates, `${name}:${c.id}`);
            for (const b of c.batesIf ?? []) add(b.bates, `${name}:${c.id}`);
          }
        if (s.type === 'card')
          for (const p of s.photos ?? []) add(p.photo.bates, `${name}:${p.id}`);
        if (s.type === 'deposition') add(s.video?.bates, `${name}:${s.id}`);
      }
    expect(owner.size).toBeGreaterThan(20);
    expect(dup).toEqual([]);
  });

  it('每張紙都有出處：Bates、照片沖印號、陳述的時間與製作人、裁定與訴狀的收文章、筆錄頁行', () => {
    const missing: string[] = [];
    for (const [name, e] of Object.entries(episodes))
      for (const s of e.scenes)
        if (s.type === 'desk')
          for (const c of s.cards)
            if (c.kind !== '論點' && !(c.bates || c.photo?.bates || c.taken || c.filed || c.cite))
              missing.push(`${name}:${c.id}`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('勘誤表引用的第 42 頁第 7 行有錨點', () => {
    const lines = Object.values(episodes).flatMap((e) =>
      e.scenes.flatMap((s) => (s.type === 'deposition' ? s.script : [])),
    );
    expect(lines.filter((l) => l.cite === '42:7').map((l) => l.id)).toEqual(['p-always']);
  });
});

describe('英文登錄表', () => {
  const en = { ep1: en1, ep2: en2 } as Record<string, Record<string, string>>;
  for (const [name, e] of Object.entries(episodes))
    it(`${name} 每一行的第一個分句在 64 個字元以內（存檔卡約兩行）`, () => {
      const rows = [
        ...e.scenes.flatMap((s) =>
          s.type === 'card' ? [...(s.filings ?? []), ...(s.docket ? [s.docket] : [])] : [],
        ),
        ...(e.disposition ?? []),
      ];
      const long = rows
        .map((r) => (en[name][r.entry] ?? '').split(/(?<=\.)\s/)[0])
        .filter((first) => !first || first.length > 64);
      expect(long).toEqual([]);
    });
});
