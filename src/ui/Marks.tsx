import { useEffect, useState, type CSSProperties } from 'react';
import type { Episode, Line } from '../engine/episode/schema';
import { Speech } from './Portrait';
import { AnnounceQueue, type Announcement } from './announce';
import { claimHand, topHand, useHandStore, type Hand } from './hand';

/**
 * 艾莉絲的手留在畫面上的記號（設計稿 inner-voice）。
 * 這裡放共用的地基：播報與一格一黃；各個記號元件隨後續 PR 加進來。
 */

let say: (text: string) => void = () => {};
const queue = new AnnounceQueue((t) => say(t));

export const announce = {
  mark: (a: Announcement) => queue.mark(a),
  voice: (text: string) => queue.voice(text),
  voiceEnd: () => queue.voiceEnd(),
};

/** 整個遊戲只放一個，所有記號都從這裡念。 */
export function Announcer() {
  const [msg, setMsg] = useState({ text: '', n: 0 });
  useEffect(() => {
    say = (text) => setMsg((m) => ({ text, n: m.n + 1 }));
    return () => {
      say = () => {};
      queue.reset();
    };
  }, []);
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span key={msg.n}>{msg.text}</span>
    </p>
  );
}

/** 記號在畫面上時認領黃色；回傳這個記號現在能不能用黃（被更高優先的手壓過就退成鉛筆）。 */
export function useHand(kind: Hand, on = true): boolean {
  useEffect(() => (on ? claimHand(kind) : undefined), [kind, on]);
  return useHandStore((s) => on && topHand(s.claims) === kind);
}

/** 把一段字裡的某些詞標上螢光（一段話只標一個詞，標第一次出現的地方）。 */
export function Hl({
  text,
  words,
  live = true,
}: {
  text: string;
  words: string[];
  live?: boolean;
}) {
  const w = words.find((x) => x && text.includes(x));
  if (!w) return <>{text}</>;
  const i = text.indexOf(w);
  return (
    <>
      {text.slice(0, i)}
      <mark className={live ? 'hl enter live' : 'hl'}>{w}</mark>
      <span className="sr-only">（艾莉絲標記）</span>
      {text.slice(i + w.length)}
    </>
  );
}

/** 手寫的字：重點詞畫鉛筆底線，逐字寫出來。 */
function Hand({ text, word }: { text: string; word?: string }) {
  const style = { '--chars': [...text].length } as CSSProperties;
  if (!word || !text.includes(word))
    return (
      <p className="hand" style={style}>
        {text}
      </p>
    );
  const i = text.indexOf(word);
  return (
    <p className="hand" style={style}>
      {text.slice(0, i)}
      <u>{word}</u>
      {text.slice(i + word.length)}
    </p>
  );
}

/** 便利貼：艾莉絲沒說出口的提醒。pinned＝貼在某個元件旁邊（電腦版浮起來，手機回到文件流）。 */
export function StickyNote({
  text,
  word,
  pinned,
}: {
  text: string;
  word?: string;
  pinned?: boolean;
}) {
  useEffect(() => announce.mark({ from: 'sticky', text: `艾莉絲的便條：${text}` }), [text]);
  return (
    <figure
      className={pinned ? 'sticky pinned enter' : 'sticky enter'}
      role="note"
      aria-label={`艾莉絲的便條：${text}`}
    >
      <Hand text={text} word={word} />
    </figure>
  );
}

/** 推理結論卡：連線成立時，3×5 索引卡上印出連線，下面是艾莉絲手寫的結論。 */
export function IndexCard({
  head,
  printed,
  text,
  word,
}: {
  head: string;
  printed: string;
  text: string;
  word?: string;
}) {
  return (
    <figure className="sticky index enter" role="note" aria-label={`推理結論：${text}`}>
      <div className="index-head">連線成立 {head && <span className="rel">{head}</span>}</div>
      <p className="printed">{printed}</p>
      <Hand text={text} word={word} />
    </figure>
  );
}

/** 章。sm＝介面上的小章（只有中文）；大章帶法院紙本的英文副標。 */
export function Stamp({ text, sub, sm }: { text: string; sub?: string; sm?: boolean }) {
  return (
    <span className={sm ? 'stamp sm enter' : 'stamp enter'} role="img" aria-label={text}>
      <b>{text}</b>
      {!sm && sub && <i>{sub}</i>}
    </span>
  );
}

const stampSub: Record<string, string> = { 准予: 'GRANTED', 駁回: 'DENIED' };

/** 裁定單：聲請的結果印在一張小訴狀紙上；駁回時，選錯的依據被鉛筆圈起來。 */
export function Ruling({
  label,
  basis,
  wrongBasis,
  request,
  quote,
  verdict,
}: {
  label: string;
  basis?: string;
  wrongBasis?: boolean;
  request?: string;
  quote?: string;
  verdict: string;
}) {
  useEffect(
    () =>
      announce.mark({
        from: 'ruling',
        text: `聲請${verdict}。${wrongBasis && basis ? `依據選錯：${basis}。` : ''}`,
      }),
    [verdict, wrongBasis, basis],
  );
  return (
    <article className="ruling" aria-label={`裁定：${verdict}${wrongBasis ? '。依據選錯' : ''}`}>
      <header>
        <span>{'卡爾德郡高等法院\u3000裁定'}</span>
        <span className="case-no">No. 26-CR-0417</span>
      </header>
      <dl>
        <dt>聲請</dt>
        <dd>{label}</dd>
        {basis && (
          <>
            <dt>依據</dt>
            <dd>{wrongBasis ? <span className="circled">{basis}</span> : basis}</dd>
          </>
        )}
        {request && (
          <>
            <dt>請求</dt>
            <dd>{request}</dd>
          </>
        )}
      </dl>
      {quote && <blockquote>{quote}</blockquote>}
      <Stamp text={verdict} sub={stampSub[verdict]} />
    </article>
  );
}

/** 兩個時間點之間的間距（回報畫面用；時間線上的版本畫在列與列之間）。 */
export function GapNote({ minutes, detail }: { minutes: string; detail: string }) {
  useHand('gap');
  useEffect(
    () => announce.mark({ from: 'gap', text: `間距 ${minutes}：${detail}`, word: minutes }),
    [minutes, detail],
  );
  return (
    <p className="gap-note" role="note" aria-label={`間距 ${minutes}：${detail}`}>
      <b>{minutes}</b>
      <span>{detail}</span>
    </p>
  );
}

/**
 * 一串台詞，把記號從對白裡拿出來：
 * 螢光筆不自成一行，而是標在前面那幾句裡；其他記號照各自的樣子畫。
 */
export function MarkLines({ lines }: { lines: Line[] }) {
  const words = lines.flatMap((l) =>
    l.mark?.kind === 'highlight' && l.mark.word ? [l.mark.word] : [],
  );
  const live = useHand('highlight', words.length > 0);
  useEffect(() => {
    if (words.length)
      announce.mark({
        from: 'highlight',
        text: `艾莉絲標記了「${words.join('、')}」`,
        word: words.join('、'),
      });
  }, [words.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {lines.map((l, i) =>
        l.mark ? (
          <MarkLine key={i} line={l} />
        ) : words.length && l.who !== '艾莉絲' ? (
          <Speech key={i} line={l} body={<Hl text={l.text} words={words} live={live} />} />
        ) : (
          <Speech key={i} line={l} />
        ),
      )}
    </>
  );
}

/** 一行記號單獨出現時的樣子。貼在別的元件上的（on）由那個元件自己畫。 */
export function MarkLine({ line }: { line: Line }) {
  const m = line.mark;
  if (!m) return null;
  const text = m.text ?? line.text;
  if (m.kind === 'sticky' && !m.on) return <StickyNote text={text} word={m.word} />;
  if (m.kind === 'gap') return <GapNote minutes={m.text ?? ''} detail={line.text} />;
  if (m.kind === 'stamp' && line.text.includes('｜')) {
    // 准予之後的時間尺：「22:24 心率歸零｜22:47 伊森刷卡進門｜23 分鐘」
    const parts = line.text.split('｜');
    return (
      <GapNote minutes={parts.at(-1) ?? ''} detail={parts.slice(0, -1).join('\u3000→\u3000')} />
    );
  }
  if (m.kind === 'stamp' && !m.on)
    return (
      <p className="stamp-line">
        <Stamp text={text} sm={!stampSub[text]} sub={stampSub[text]} />
      </p>
    );
  return null;
}

/** 證據卡上的螢光：回報裡標了 on 某張卡的詞，那張卡上也標出來。 */
const hlCache = new WeakMap<Episode, Record<string, string[]>>();
export function cardHighlights(e: Episode): Record<string, string[]> {
  const hit = hlCache.get(e);
  if (hit) return hit;
  const out: Record<string, string[]> = {};
  hlCache.set(e, out);
  for (const s of e.scenes)
    if (s.type === 'desk')
      for (const j of s.jobs)
        for (const l of j.report)
          if (l.mark?.kind === 'highlight' && l.mark.on && l.mark.word)
            (out[l.mark.on] ??= []).push(l.mark.word);
  return out;
}
