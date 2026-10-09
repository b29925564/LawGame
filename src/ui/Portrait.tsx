import { useEffect, useState, type ReactNode } from 'react';
import type { Line } from '../engine/episode/schema';
import { useT } from '../i18n';
import { LUCAS, lucas } from './cast';
import { useScope } from './lang';
import { CourtFace, useInCourt } from './jury/CourtFace';
import { MarkLine } from './Marks';
import { VoLine } from './VoiceOver';

/**
 * 角色頭像，4:5。盧卡斯用正式立繪（cast.ts）；其他人在法庭是剪影替身（jury/CourtFace），
 * 法庭外還是暫代版，用固定的五官元件畫出來，情緒換表情。
 */
const palette: Record<string, string> = {
  盧卡斯: '#1f4e8c',
  伊森: '#2d6b57',
  '伊森・蕭': '#2d6b57',
  '馬庫斯・海爾': '#5b3f86',
  '維多莉亞・惠特洛克': '#8c2f4d',
  羅根: '#7a5522',
  '羅根・普萊斯': '#7a5522',
  戴文: '#2f6f7a',
  蘿莎: '#7a3f2f',
  柯瓦斯基: '#41505f',
  莫羅: '#8c4b1f',
  法官: '#3c3c3c',
  旁白: 'transparent',
  語音: '#4a5866',
};

const brows: Record<Line['mood'], string> = {
  平: '0',
  緊: '-10',
  暖: '4',
  硬: '-4',
  慌: '-14',
  默: '-2',
};
const mouths: Record<Line['mood'], string> = {
  平: 'M 22 42 q 10 4 20 0',
  緊: 'M 22 44 q 10 -3 20 0',
  暖: 'M 22 41 q 10 8 20 0',
  硬: 'M 22 43 h 20',
  慌: 'M 24 45 q 8 -6 16 0',
  默: 'M 25 43 h 14',
};

export function Portrait({
  who,
  mood = '平',
  decorative,
}: {
  who: string;
  mood?: Line['mood'];
  /** 旁邊已經寫了名字（台詞）：頭像不再念一次（無障礙審查第 6 條）。 */
  decorative?: boolean;
}) {
  const t = useT();
  const inCourt = useInCourt();
  const a11y = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': t(who) } as const);
  const color = palette[who] ?? '#4a5866';
  if (who === '旁白') return null;
  // 法庭裡的配角是剪影替身（P4-2），不再用暫代的五官；盧卡斯照舊放立繪。
  if (inCourt && who !== LUCAS) return <CourtFace who={who} />;
  const src = who === LUCAS ? lucas(mood, 144) : undefined;
  if (src)
    return (
      <span className="portrait art" {...a11y}>
        <img
          src={src}
          srcSet={`${src} 144w, ${lucas(mood, 512)} 512w`}
          sizes="(min-width: 768px) 108px, 84px"
          alt=""
          decoding="async"
        />
      </span>
    );
  const brow = Number(brows[mood] ?? 0);
  return (
    <svg className="portrait" viewBox="0 0 64 80" {...a11y} focusable="false">
      <g transform="translate(0 14)">
        <circle cx="32" cy="32" r="30" fill={color} opacity="0.16" />
        <circle cx="32" cy="27" r="17" fill={color} opacity="0.32" />
        <path d="M 8 62 q 24 -18 48 0 z" fill={color} opacity="0.32" />
        <g stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none">
          <line x1="21" y1={26 + brow / 5} x2="29" y2={24 + brow / 4} />
          <line x1="35" y1={24 + brow / 4} x2="43" y2={26 + brow / 5} />
          <circle cx="25" cy="33" r="1.6" fill={color} stroke="none" />
          <circle cx="39" cy="33" r="1.6" fill={color} stroke="none" />
          <path d={mouths[mood] ?? mouths['平']} />
        </g>
      </g>
    </svg>
  );
}

/** 一行台詞。盧卡斯沒說出口的話不進對白框：記號交給 Marks，畫外字幕交給 VoiceOver。 */
export function Speech({ line: raw, body }: { line: Line; body?: ReactNode }) {
  const t = useT();
  const scope = useScope();
  // 英文模式查表；說話者的 who 留著中文給立繪配色用，畫面上顯示譯名。
  const line = { ...raw, text: t(raw.text, scope) };
  // 記號不是說出口的話，不進對白框（設計稿 inner-voice）。
  if (line.mark) return <MarkLine line={line} />;
  if (line.voice === 'off') return <VoLine line={line} />;
  // 還沒改寫的舊心聲：不再掛「（心裡）」，先當成畫外字幕的筆錄行。
  if (line.thought)
    return (
      <p className="vo-log">
        <span className="vo-mark" aria-hidden />
        <span>{line.text}</span>
      </p>
    );
  if (line.who === '旁白') return <p className="narration">{body ?? line.text}</p>;
  return (
    <p className="speech">
      <Portrait who={line.who} mood={line.mood} decorative />
      <span>
        <span className="who">{t(line.who)}</span>
        {body ?? line.text}
      </span>
    </p>
  );
}

const wide = '(min-width: 1360px)';

function useWide() {
  const [on, setOn] = useState(() => globalThis.matchMedia?.(wide).matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(wide);
    if (!mq) return;
    const on = () => setOn(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return on;
}

/**
 * 對話場景旁的盧卡斯大圖（1024，寬螢幕才有；手機不載）。他還沒開口就不出現。
 * 立繪包全組對齊過，換表情時疊起來交叉淡化，不會跳位。
 */
export function LucasStage({ lines }: { lines: Line[] }) {
  const show = useWide();
  const said = lines.filter((l) => l.who === LUCAS && !l.mark);
  if (!show || !said.length) return null;
  const now = lucas(said[said.length - 1].mood, 1024);
  const seen = [...new Set(said.map((l) => l.mood))];
  return (
    <figure className="lucas-stage" aria-hidden>
      {seen.map((mood) => {
        const big = lucas(mood, 1024);
        return (
          <img
            key={mood}
            src={big}
            srcSet={`${lucas(mood, 512)} 512w, ${big} 1024w`}
            sizes="300px"
            alt=""
            decoding="async"
            className={big === now ? 'on' : undefined}
          />
        );
      })}
    </figure>
  );
}
