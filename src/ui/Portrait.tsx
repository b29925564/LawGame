import { useEffect, useState, type ReactNode } from 'react';
import type { Line } from '../engine/episode/schema';
import { useT } from '../i18n';
import { LUCAS, lucas } from './cast';
import { IdPhoto } from './IdPhoto';
import { useScope } from './lang';
import { CourtFace, useInCourt } from './jury/CourtFace';
import { MarkLine } from './Marks';
import { prose } from './prose';
import { VoLine } from './VoiceOver';

/**
 * 角色頭像，4:5。盧卡斯用正式立繪（cast.ts）；其他人在法庭是剪影替身（jury/CourtFace），
 * 在桌上和卷宗旁是檔案照（IdPhoto 模板 B；視覺規格 §16，使用者 10-09）。程式畫的卡通臉已下架。
 */

/** 不是人的說話者：電話語音、派單 App。 */
const faceless = new Set(['語音', '卡爾德快遞']);

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
  if (who === '旁白') return null;
  // 不是人的說話者：不放頭像也不放黑條（黑條留給林肯），頭像那一格留空，台詞左緣才和別人對齊（設計師 #258）。
  if (faceless.has(who)) return <span className="portrait faceless" aria-hidden />;
  // 法庭裡的配角是剪影替身（P4-2）；盧卡斯照舊放立繪。
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
  return (
    <span className="portrait id" {...a11y}>
      <IdPhoto who={who} size="fill" />
    </span>
  );
}

/** 一行台詞。盧卡斯沒說出口的話不進對白框：記號交給 Marks，畫外字幕交給 VoiceOver。 */
export function Speech({
  line: raw,
  body,
  wrap = false,
}: {
  line: Line;
  body?: ReactNode;
  /** 中文詞不斷開、末行不留一兩個字（prose.tsx）。法庭裡（CourtCast）一律開；調解、理論、開場由呼叫的人開。 */
  wrap?: boolean;
}) {
  const t = useT();
  const scope = useScope();
  const inCourt = useInCourt();
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
  // 法庭裡的對白：中文詞不斷開、末行不留一兩個字（prose.tsx；設計師 #225 第三輪）。
  const text = body ?? (wrap || inCourt ? prose(line.text) : line.text);
  if (line.who === '旁白') return <p className="narration">{text}</p>;
  return (
    <p className="speech">
      <Portrait who={line.who} mood={line.mood} decorative />
      <span>
        <span className="who">{t(line.who)}</span>
        {text}
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
