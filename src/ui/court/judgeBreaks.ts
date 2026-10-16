/**
 * 法官英文台詞的人工斷點（設計師 #290 第三輪後續：字幕業的做法，不讓程式猜英文句子結構）。
 * 凡是在任何寬度、字級下會分張的法官台詞（一句一行為單位），都在這裡標：
 *   |  分張點，第一優先（先只用這些；整句每一段都放得進兩行就夠了）
 *   ¦  分張點，第二優先（第一優先用完還有段放不進兩行，才再加這些）
 *   /  只換行（不分張）
 *   ~  勉強的換行點（只有 / 與分張點都放不進才用；每一個都要設計師確認）
 * 沒有用到的分張點，在合成一張時當換行點用。標記取代原本的空白。
 * 程式先照標的切；一句沒有標、或標的放不進，才退回 subtitleSplit 的規則。單元測試（judgeCards.test.ts）要求
 * 所有會分張的台詞都在這裡，而且切出來的位置都是標的位置。以後新增的台詞照樣要標。
 */
export const JUDGE_BREAKS: readonly string[] = [
  // ── 設計師 #290 審查（a3217c1）給的斷點 ──
  "Counsel,/don't put/the answer|in the question.",
  'A prior record/is/character evidence.',
  'It cannot be used|to prove¦what the defendant/did/this time.',
  'The jury/will disregard¦the question.',
  "The victim's~words¦cannot come in|through this witness.",
  "The witness's opinion/of the defendant|is/character evidence.",
  'It cannot be used|to prove/what he did/that night.',
  'Members~of the jury:|the testimony/of Ms. Adler¦is stricken/in its entirety.',
  'You will not/consider it|in your~deliberations.',
  'Counsel,/let the witness|answer~for herself.',
  "The witness~has no way/of knowing|what the defendants'~executives/have read.",
  'The witness may/testify|only to her own~research.',
  "There's nothing wrong|with that/question, counsel.",
  'The court has~excluded/that statement|and the prosecution/may not/raise it.',
  // ── 以下是我標的，等設計師確認 ──
  'The guard/can come|and/testify himself.',
  "The witness/is not inside|the defendant's~head.",
  "The witness/cannot guess at|the defendant's~intent.",
  'The defense/may examine|Sophie Martinez.',
  'The defense/may examine|Dr. Joanna Fisher.',
  'The defense/may examine|Dr. Michael Tang.',
  "Counsel,/don't testify|for the witness.",
  'The witness/may~only testify|to what she/knows herself.',
  'This court/has excluded/that testimony.',
  'Counsel will not/bring it in|through~the back door.',
  'The witness/is a physician,|not an expert/on dispatch systems.',
];

export type MarkKind = '1' | '2' | 'L' | 'W';

export interface Marked {
  words: string[];
  /** kinds[b]：第 b 個字前面的標記（沒有就是空字串）。 */
  kinds: ('' | MarkKind)[];
}

const key = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

export function parseMarked(src: string): Marked {
  const words: string[] = [];
  const kinds: ('' | MarkKind)[] = [];
  let kind: '' | MarkKind = '';
  for (const tok of src.split(/([|¦/~ ])/)) {
    if (tok === '|') kind = '1';
    else if (tok === '¦') kind = '2';
    else if (tok === '/') kind = 'L';
    else if (tok === '~') kind = 'W';
    else if (tok === ' ' || tok === '') continue;
    else {
      words.push(tok);
      kinds.push(words.length > 1 ? kind : '');
      kind = '';
    }
  }
  return { words, kinds };
}

export const plainOf = (m: Marked) => m.words.join(' ');

const BY_TEXT = new Map(JUDGE_BREAKS.map((s) => [key(plainOf(parseMarked(s))), parseMarked(s)]));

/** 這一句的標記（比對時不分直彎撇號、空白）；沒標回傳 undefined。 */
export const markedFor = (sentence: string) => BY_TEXT.get(key(sentence));
