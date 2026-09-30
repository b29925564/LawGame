import type { Line } from '../engine/episode/schema';

/**
 * 角色半身照的暫代版：用固定的五官元件畫出來，情緒換表情。
 * 正式立繪進來時只要換掉這個元件（製作流程第 4 節的素材管線）。
 */
const palette: Record<string, string> = {
  艾莉絲: '#1f4e8c',
  伊森: '#2d6b57',
  '伊森・蕭': '#2d6b57',
  '馬可仕・海爾': '#5b3f86',
  '薇薇安・惠特洛克': '#8c2f4d',
  羅根: '#7a5522',
  '羅根・皮爾斯': '#7a5522',
  戴文: '#2f6f7a',
  蘿莎: '#7a3f2f',
  柯瓦斯基: '#41505f',
  莫羅: '#8c4b1f',
  法官: '#3c3c3c',
  旁白: 'transparent',
  語音: '#4a5866',
};

const brows: Record<Line['mood'], string> = { 平: '0', 緊: '-10', 暖: '4', 硬: '-4' };
const mouths: Record<Line['mood'], string> = {
  平: 'M 22 42 q 10 4 20 0',
  緊: 'M 22 44 q 10 -3 20 0',
  暖: 'M 22 41 q 10 8 20 0',
  硬: 'M 22 43 h 20',
};

export function Portrait({ who, mood = '平' }: { who: string; mood?: Line['mood'] }) {
  const color = palette[who] ?? '#4a5866';
  if (who === '旁白') return null;
  return (
    <svg className="portrait" viewBox="0 0 64 64" role="img" aria-label={who} focusable="false">
      <circle cx="32" cy="32" r="30" fill={color} opacity="0.16" />
      <circle cx="32" cy="27" r="17" fill={color} opacity="0.32" />
      <path d="M 8 62 q 24 -18 48 0 z" fill={color} opacity="0.32" />
      <g stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none">
        <line x1="21" y1={26 + Number(brows[mood]) / 5} x2="29" y2={24 + Number(brows[mood]) / 4} />
        <line x1="35" y1={24 + Number(brows[mood]) / 4} x2="43" y2={26 + Number(brows[mood]) / 5} />
        <circle cx="25" cy="33" r="1.6" fill={color} stroke="none" />
        <circle cx="39" cy="33" r="1.6" fill={color} stroke="none" />
        <path d={mouths[mood]} />
      </g>
    </svg>
  );
}

/** 一行台詞。艾莉絲的內心獨白用不同的排版，是提示的主要載體。 */
export function Speech({ line }: { line: Line }) {
  if (line.thought)
    return (
      <p className="thought">
        <span className="who">{line.who}（心裡）</span>
        {line.text}
      </p>
    );
  if (line.who === '旁白') return <p className="narration">{line.text}</p>;
  return (
    <p className="speech">
      <Portrait who={line.who} mood={line.mood} />
      <span>
        <span className="who">{line.who}</span>
        {line.text}
      </span>
    </p>
  );
}
