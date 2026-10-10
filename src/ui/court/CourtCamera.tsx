import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useT } from '../../i18n';
import { useSettings } from '../../engine/settings';
import { useScope } from '../lang';
import type { Cue } from '../record';
import { readUnits, splitCards, subEm, SUB_MIN_UNITS } from './subtitleSplit';
import { castLook } from '../jury/cast';
import { svg } from '../jury/silhouette';

/**
 * 法庭鏡頭（設定集第 7 章「3D 立牌」與 :21–22 裁切規則、第 10.3／10.4 章；設計師 P3 裁定 5）。
 * 桌機是中欄一條 2.39:1 的鏡頭條，手機在招牌時刻插一張 16:9；兩種都從同一張機位圖裁，眼線在畫面高度 1/3。
 *
 * 一個機位由這幾個檔組成（src/ui/court/cam/，算圖來了直接覆蓋，不用改程式）：
 * - `{機位}.json`：清單。standee＝立牌（400×500 的剪影卡面）在 16:9 畫面裡的左、上、寬（比例）；
 *   crop239＝鏡頭條的裁切框 [x, y, w, h]（比例）；eye＝眼線高度；slots＝法官席每一場的窗光時段；
 *   placeholder＝占位圖（框上方標「待放 3D 機位」）。
 * - `{機位}-{狀態}.avif／.webp`：那個狀態的底圖（各層光已合成好、調過色，人不在圖裡、影子在）。
 *   證人席的狀態是 default／lock／build／confront／fifth；法官席是 p0–p5（耐心剩幾根燈管），
 *   有時段就是 bench-{時段}-p{n}。找不到就退回 default。
 * - `{機位}-{狀態}-rim.webp`：立牌的受光圖（灰階，和底圖同一個畫面）。輪廓光乘上它，被百葉窗光條、
 *   盧卡斯的影子擋掉的地方就沒有輪廓光；沒有這張就照剪影自己的燈畫。
 * - `{機位}-front.webp`（或 `{機位}-{狀態}-front.webp`）：擋在立牌前面的東西（證人席桌面、欄杆、法官席桌緣），帶 alpha。
 */

const PLATES = import.meta.glob('./cam/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const MANIFESTS = import.meta.glob('./cam/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Manifest
>;

interface Manifest {
  placeholder?: boolean;
  eye: number;
  crop239: [number, number, number, number];
  standee: { x: number; y: number; w: number };
  slots?: Record<string, string>;
}

export type Cam = 'witness' | 'bench';
export type Shot = Cam | 'black';
/** 證人席的五個狀態（第 10.4 章：作證、鎖定、鋪陳、對質，加上援引緘默權）。 */
export type WitnessState = 'default' | 'lock' | 'build' | 'confront' | 'fifth';

const LABEL: Record<Cam, string> = { witness: '證人席', bench: '法官席' };

function pick(names: string[]) {
  for (const n of names) {
    const avif = PLATES[`./cam/${n}.avif`];
    const webp = PLATES[`./cam/${n}.webp`];
    if (avif || webp) return { avif, webp: webp ?? avif };
  }
  return null;
}

function Img({ src, className }: { src: { avif?: string; webp: string }; className: string }) {
  return (
    <picture className={className}>
      {src.avif && src.avif !== src.webp && <source type="image/avif" srcSet={src.avif} />}
      <img src={src.webp} alt="" decoding="async" draggable={false} />
    </picture>
  );
}

/** 一個機位：底圖、立牌（本體＋受光）、前景。 */
function Stage({
  cam,
  who,
  names,
  on,
  mode,
  frameW,
  turn = false,
}: {
  cam: Cam;
  who: string;
  names: string[];
  on: boolean;
  mode: 'strip' | 'insert';
  frameW: number;
  /** 援引緘默權：立牌換成轉頭的剪影（機位審查 review-v1 第 2 條）。 */
  turn?: boolean;
}) {
  const m = MANIFESTS[`./cam/${cam}.json`];
  // 16:9 的機位圖放進框裡：照裁切框把整張圖往上、往左推（2.39:1 只露出 crop239 那一段，眼線仍在 1/3）。
  const crop = mode === 'strip' && m ? m.crop239 : [0, 0, 1, 1];
  const width = frameW / crop[2];
  const plate = pick(names);
  const rim = pick(names.map((n) => `${n}-rim`));
  const front = pick([...names.map((n) => `${n}-front`), `${cam}-front`]);
  const look = castLook(who);
  // 輪廓光照顯示寬度換算：畫面上 1.25px（設計師：1–1.5px，不能是原圖上的寬）。取 0.5 的倍數，拖拉視窗時不一直重畫。
  const shown = (m?.standee.w ?? 0.2) * width;
  const rimUnits = shown > 0 ? Math.max(1, Math.round(((1.25 * 400) / shown) * 2) / 2) : 8;
  // 眼神光畫面上至少 2×2 px。
  const catchSize = shown > 0 ? Math.max(5, Math.ceil((2 * 400) / shown)) : 5;
  // 證人席有正面和轉頭兩張立牌，換的時候交叉淡化（第 7 章 :75，--dur-turn），不硬切。
  const poses = useMemo(() => {
    if (!look) return [];
    return (cam === 'witness' ? [false, true] : [false]).map((t) => {
      const o = {
        v: 85,
        pose: 'J1' as const,
        bg: false,
        rim: rimUnits,
        catchSize,
        turn: t,
        uid: `cam-${cam}-${look.id}${t ? '-turn' : ''}`,
      };
      return {
        turn: t,
        body: svg(look, { ...o, part: 'body' }),
        light: svg(look, { ...o, part: 'light' }),
      };
    });
  }, [look, rimUnits, catchSize, cam]);
  if (!m || !plate) return null;
  const box = {
    left: `${m.standee.x * 100}%`,
    top: `${m.standee.y * 100}%`,
    width: `${m.standee.w * 100}%`,
  };
  return (
    <div
      className="cam-stage"
      data-cam={cam}
      data-on={on || undefined}
      style={
        { '--cx': crop[0], '--cy': crop[1], '--cw': crop[2], '--ch': crop[3] } as CSSProperties
      }
    >
      <Img src={plate} className="cam-plate" />
      {poses.map((p) => (
        <span key={String(p.turn)} className="cam-pose" data-on={p.turn === turn || undefined}>
          <span className="cam-standee" style={box} dangerouslySetInnerHTML={{ __html: p.body }} />
          <span
            className="cam-light"
            style={rim ? ({ '--rim': `url("${rim.webp}")` } as CSSProperties) : undefined}
            data-rim={rim ? '' : undefined}
          >
            <span
              className="cam-standee"
              style={box}
              dangerouslySetInnerHTML={{ __html: p.light }}
            />
          </span>
        </span>
      ))}
      {front && <Img src={front} className="cam-front" />}
    </div>
  );
}

export function CourtCamera({
  shot,
  witness,
  state,
  patience,
  scene,
  mode,
  open = true,
  cues = [],
  ref,
}: {
  shot: Shot;
  /** 證人席上的人（劇本裡的名字，對到剪影組）。 */
  witness: string;
  state: WitnessState;
  patience: number;
  scene: string;
  /** strip：桌機中欄的 2.39:1 鏡頭條；insert：手機插入的 16:9。 */
  mode: 'strip' | 'insert';
  /** 手機插入的鏡頭只在招牌時刻打開。 */
  open?: boolean;
  /** 字幕列（設定集 10.1）：鏡頭裡的人說的話，由筆錄交出來。 */
  cues?: Cue[];
  /** 手機：筆錄要知道鏡頭蓋住它多少（最新那一行捲到鏡頭上面）。 */
  ref?: Ref<HTMLDivElement>;
}) {
  const t = useT();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // 標籤跟著目前的機位走；一刀黑的那一格沿用上一個。
  const [last, setLast] = useState<Cam>('witness');
  const cam: Cam = shot === 'black' ? last : shot;
  if (shot !== 'black' && shot !== last) setLast(shot);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slot = MANIFESTS['./cam/bench.json']?.slots?.[scene];
  const benchNames = [
    ...(slot ? [`bench-${slot}-p${Math.max(0, patience)}`] : []),
    `bench-p${Math.max(0, patience)}`,
    'bench-default',
  ];
  const witnessNames = [`witness-${state}`, 'witness-default'];
  const placeholder = MANIFESTS[`./cam/${cam}.json`]?.placeholder;

  return (
    <div ref={ref} className={`court-cam ${mode}`} data-open={open || undefined} aria-hidden>
      {placeholder && (
        <span className="tbd-label">
          <span>{t('待放 3D 機位')}</span>
          <span>{t(LABEL[cam])}</span>
        </span>
      )}
      <div className="cam-frame" ref={frame} data-shot={shot}>
        <Stage
          cam="witness"
          who={witness}
          names={witnessNames}
          on={shot === 'witness'}
          mode={mode}
          frameW={width}
          turn={state === 'fifth'}
        />
        <Stage
          cam="bench"
          who="法官"
          names={benchNames}
          on={shot === 'bench'}
          mode={mode}
          frameW={width}
        />
        <div className="cam-black" />
        <Subtitles cues={cues} />
      </div>
    </div>
  );
}

/**
 * 字幕列（設定集 10.1、RD-ART-1001）：鏡頭層上的介面，永遠不被調色、不被一刀黑蓋掉。
 * 說話者名 --cine-muted、台詞 Noto Sans TC 500；底框 rgb(6 8 11 / 72%)、6px 圓角、雙層文字陰影。
 * 一批裡的每句疊在同一格：各自在 --at 出現、在下一句的 --at 收掉，時間跟筆錄同一張節拍表，不另開計時器。
 * 被蓋掉的話（異議成立、自紀錄刪除）只剩一條黑條，條裡寫原因（第 1 章「默」：黑條只在字幕列與筆錄）。
 */
function Subtitles({ cues }: { cues: Cue[] }) {
  const t = useT();
  const scope = useScope();
  const box = useRef<HTMLDivElement>(null);
  // 設定裡的「字幕」字級（1／1.25／1.5）與底框，跟畫外字幕同一組。
  const voScale = useSettings((s) => s.voScale);
  const voBox = useSettings((s) => s.voBox);
  // 一行放得下幾 em、一張放得下幾行：量框寬與實際字級；行數看「下巴線到框底」放得下幾行（最少 1、最多 2，設計師 #257）。
  const [fit, setFit] = useState({ em: 30, lines: 2 });
  const shown = cues.length > 0;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const frame = el.offsetParent as HTMLElement | null;
    const measure = () => {
      const insert = !!el.closest('.court-cam.insert');
      // 字幕字級：桌機 19px、手機特寫 17px，說話者名 14／13px，再乘設定裡的倍率（court.css 同一組數字）。
      const px = (insert ? 17 : 19) * voScale;
      const who = (insert ? 13 : 14) * 1.4 * voScale;
      // 下巴線約在鏡頭條高度的 47%（手機特寫 50%），框底留 10px；機位 manifest 來了改讀它。
      const h = frame?.clientHeight ?? 0;
      const room = h - 10 - h * (insert ? 0.5 : 0.47) - who - 10;
      const lines = h ? Math.max(1, Math.min(2, Math.floor(room / (px * 1.5)))) : 2;
      setFit({ em: subEm(el.clientWidth, px), lines });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [shown, voScale]);
  const cards = useMemo(() => {
    const flat: {
      key: string;
      who: string;
      text?: string;
      lines?: string[];
      blank?: boolean;
      redact?: Cue['redact'];
      at: string;
      cue: string;
      next?: string;
    }[] = [];
    for (const c of cues) {
      if (c.blank) {
        flat.push({ key: c.key, who: '', blank: true, at: c.at, cue: c.key });
        continue;
      }
      if (c.redact) {
        flat.push({ key: c.key, who: c.who, redact: c.redact, at: c.at, cue: c.key });
        continue;
      }
      const parts = splitCards(c.text, fit.em, fit.lines);
      // 每張讀得完才換下一張：漢字 1 單位、其他 0.35，至少 10 單位；從這句出現的時間累計（字幕比筆錄慢，不閃過）。
      let read = 0;
      parts.forEach((p, k) => {
        flat.push({
          key: `${c.key}.${k}`,
          who: c.who,
          text: p.text,
          lines: p.lines,
          cue: c.key,
          at: read > 0 ? `calc(${c.at} + ${read} * var(--dur-sub-unit))` : c.at,
        });
        read += Math.max(SUB_MIN_UNITS, readUnits(p.text));
      });
    }
    // 每張收在下一張出現時；下一句（別的人）先到，就在那一刻收，不讓長句的後幾張壓在新的一句上。
    flat.forEach((c, i) => {
      const nextCard = flat[i + 1];
      if (!nextCard) return;
      const nextCue = flat.slice(i + 1).find((x) => x.cue !== c.cue);
      c.next =
        nextCard.cue === c.cue && nextCue ? `min(${nextCard.at}, ${nextCue.at})` : nextCard.at;
    });
    return flat;
  }, [cues, fit]);
  if (!cues.length) return null;
  return (
    <div
      className="cam-subs"
      ref={box}
      data-subbox={voBox ? 'on' : undefined}
      style={{ '--sub-scale': voScale } as CSSProperties}
    >
      {cards.map((c, i) =>
        c.blank ? null : (
          <p
            key={c.key}
            className="cam-sub"
            style={{ '--at': c.at, '--next': c.next } as CSSProperties}
            data-last={i === cards.length - 1 || undefined}
          >
            <span className="who">{t(c.who, scope)}</span>
            {c.redact ? (
              <span className="sub-bar">
                <small>{t(c.redact)}</small>
              </span>
            ) : (
              <span className="tx">
                {c.lines
                  ? c.lines.map((l) => (
                      <span key={l} className="ln">
                        {l}
                      </span>
                    ))
                  : c.text}
              </span>
            )}
          </p>
        ),
      )}
    </div>
  );
}
