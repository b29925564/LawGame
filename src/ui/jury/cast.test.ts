import { describe, expect, it } from 'vitest';
import { episodes } from '../../content';
import { DA, JUDGE } from '../../engine/episode/trial';
import { LUCAS } from '../cast';
import { castLook, ID, NO_FACE } from './cast';

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

/** 兩集劇本裡會顯示頭像的名字：台詞的 who:、證人 witness.name、詰問的人 examiner（不分場景）。 */
function everyWho() {
  const out = new Set<string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.who === 'string') out.add(o.who);
      if (typeof o.examiner === 'string') out.add(o.examiner);
      const w = o.witness as { name?: unknown } | undefined;
      if (w && typeof w.name === 'string') out.add(w.name);
      Object.values(o).forEach(walk);
    }
  };
  for (const ep of Object.values(episodes)) walk(ep.scenes);
  return [...out];
}

describe('說話者頭像（設計師 #446）', () => {
  it('兩集劇本裡每個 who:、證人、詰問的人：要嘛在 ID 表裡，要嘛在無頭像名單裡', () => {
    const all = everyWho();
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((w) => w !== LUCAS && !(w in ID) && !NO_FACE.has(w))).toEqual([]);
  });
  it('在 ID 表裡的人都畫得出剪影；無頭像名單裡的人沒有剪影', () => {
    expect(Object.keys(ID).filter((w) => !castLook(w))).toEqual([]);
    expect([...NO_FACE].filter((w) => castLook(w))).toEqual([]);
  });
  it('潔德、奧瑪、普萊斯的短名對到同一個人', () => {
    expect(castLook('潔德')?.id).toBe('jade');
    expect(castLook('潔德・坎農')).toBe(castLook('潔德'));
    expect(castLook('奧瑪')).toBe(castLook('奧瑪・哈桑'));
    expect(castLook('普萊斯')).toBe(castLook('羅根'));
    expect(castLook('艾瑪・徐')?.id).toBe('emma');
    // 潔德的光是手機的冷光，不是鈉燈（審查 #460：橘邊跟黃色按鈕搶）。
    expect(castLook('潔德')?.light).toBe('screen');
  });
});
