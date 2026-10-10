import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { DA, JUDGE } from '../../engine/episode/trial';
import { LUCAS } from '../cast';
import { castLook } from './cast';

const COURT = new Set(['trial', 'defense', 'closing', 'voirdire']);
const SYSTEM = new Set(['旁白', '語音', '法院系統', LUCAS]);

/** 法庭畫面裡會開口的人：台詞的 who、證人、法官、檢方。 */
function speakers() {
  const out = new Set<string>([JUDGE, DA]);
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.who === 'string') out.add(o.who);
      Object.values(o).forEach(walk);
    }
  };
  for (const ep of Object.values(episodes))
    for (const s of ep.scenes as { type: string; witness?: { name: string } }[])
      if (COURT.has(s.type)) {
        walk(s);
        if (s.witness) out.add(s.witness.name);
      }
  return [...out].filter((w) => !SYSTEM.has(w));
}

describe('法庭剪影替身', () => {
  it('法庭上每個開口的配角都有剪影參數', () => {
    expect(speakers().filter((w) => !castLook(w))).toEqual([]);
  });
  it('短名、全名、職稱對到同一個人', () => {
    expect(castLook('莫羅')).toBe(castLook('莫羅檢察官'));
    expect(castLook('伊森')).toBe(castLook('伊森・蕭'));
  });
});
