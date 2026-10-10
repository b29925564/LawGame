import * as branch from '../engine/episode/branch';
import { branchContext, episodeOf } from '../engine/game';
import type { Progress } from '../engine/save';
import { useT } from '../i18n';
import { straight } from '../i18n/curly';
import { useScope } from './lang';

/**
 * 做決定之前先看帳（UX 決策代價規格一）：集層級 effects 裡，加上這些旗標就會成立的那幾條。
 * 已經成立的不算（那是之前的決定付過的）。條件還要看之後選哪個理論的，標成「若以……開庭」。
 */
export function effectsIf(p: Progress, flags: string[]) {
  const effects = episodeOf(p).effects;
  if (!effects.length || !flags.length) return [];
  const now = branchContext(p);
  const then = { ...now, flags: [...new Set([...now.flags, ...flags])] };
  const theories = episodeOf(p).scenes.find((s) => s.type === 'theory')?.theories ?? [];
  return effects
    .filter((e) => e.when?.flags?.some((f) => flags.includes(f)))
    .filter((e) => !branch.matches(e.when, now))
    .flatMap((e) => {
      // 理論還沒選：把條件裡的理論當作已選，另外標出來。
      const pending = e.when?.theory && !then.theory ? e.when.theory : null;
      const ctx = pending ? { ...then, theory: pending[0] } : then;
      if (!branch.matches(e.when, ctx)) return [];
      const names = pending
        ? pending.map((id) => theories.find((x) => x.id === id)?.name ?? id)
        : [];
      return [{ ...e, theoryNames: names }];
    });
}

/** 陪審團起點的格數（決策代價規格二）：<10 一格、10–24 兩格、≥25 三格。 */
const bars = (n: number) => '▮'.repeat(n < 10 ? 1 : n < 25 ? 2 : 3).padEnd(3, '▯');

/** 用律師想事情的單位說代價：陪審團用格、信任用格、信心用一句話；不顯示內部數字。 */
export function EffectLines({ items }: { items: ReturnType<typeof effectsIf> }) {
  const t = useT();
  const scope = useScope();
  if (!items.length) return null;
  return (
    <ul className="cost-lines" aria-label={t('代價')}>
      {items.flatMap((e, i) => {
        const pre = e.theoryNames.length
          ? t('若以「{names}」開庭：', {
              names: e.theoryNames.map((n) => t(n, scope)).join(straight(t('」或「'))),
            })
          : '';
        const lines: string[] = [];
        if (e.jury > 0) lines.push(t('陪審團起點往對方偏 {bars}', { bars: bars(e.jury) }));
        if (e.jury < 0) lines.push(t('陪審團起點往我方偏 {bars}', { bars: bars(-e.jury) }));
        if (e.confidence > 0) lines.push(t('調解時對方開價更硬'));
        if (e.confidence < 0) lines.push(t('調解時對方開價更軟'));
        if (e.trust < 0) lines.push(t('客戶信任掉 {n} 格', { n: -e.trust }));
        if (e.trust > 0) lines.push(t('客戶信任多 {n} 格', { n: e.trust }));
        if (e.flags.length) lines.push(t('這件事會記到下一集'));
        return lines.map((l, j) => (
          <li key={`${i}-${j}`}>
            {pre && <span className="muted">{pre}</span>}
            {l}
          </li>
        ));
      })}
    </ul>
  );
}
