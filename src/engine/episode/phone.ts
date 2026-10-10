import type { PhoneScene, PhoneStep } from './schema';

export interface Bubble {
  id?: string;
  mine: boolean;
  text: string;
  retracted: boolean;
  /** 被收回的時刻（劇本 retract 步驟的 time）；黑條裡寫「此訊息已被收回 23:14」。 */
  retractedAt?: string;
}

export interface Line {
  who: string;
  text: string;
}

export type Screen = 'caption' | 'lock' | 'chat' | 'talk' | 'ride' | 'badge' | 'door';

export interface PhoneView {
  time: string;
  screen: Screen;
  step: PhoneStep;
  /** 目前打開的聊天對象。 */
  thread: string | null;
  threads: Record<string, Bubble[]>;
  /** 目前這段對話說過的話（換到別的畫面就清空）。 */
  talk: Line[];
  /** choose 步驟已經選了哪一項；還沒選是 null。 */
  chosen: number | null;
}

const screenOf = (s: PhoneStep): Screen => {
  switch (s.do) {
    case 'notify':
      return 'lock';
    case 'say':
    case 'retract':
      return 'chat';
    case 'choose':
      return s.mode;
    default:
      return s.do;
  }
};

/**
 * 從頭重播劇本到第 step 步，算出手機現在的樣子。
 * 存檔只需要記步數與選擇，畫面永遠由劇本重建，改劇本不會讓舊存檔的畫面錯亂。
 */
export function phoneView(
  scene: PhoneScene,
  step: number,
  choices: Record<number, number>,
): PhoneView {
  const threads: Record<string, Bubble[]> = {};
  let thread: string | null = null;
  let talk: Line[] = [];
  let time = '';
  const push = (who: string, b: Bubble) => (threads[who] ??= []).push(b);

  const last = Math.min(step, scene.steps.length - 1);
  for (let i = 0; i <= last; i++) {
    const s = scene.steps[i];
    if ('time' in s && s.time) time = s.time;
    if (screenOf(s) !== 'talk') talk = [];
    switch (s.do) {
      case 'notify':
      case 'say': {
        const m = s.message;
        const mine = m.from === 'me';
        if (!mine) thread = m.from;
        // 通知在點開之前還不算進聊天室；下一步才會出現在對話裡。
        if (s.do === 'notify' && i === last) break;
        push(mine ? (thread ?? '') : m.from, { id: m.id, mine, text: m.text, retracted: false });
        break;
      }
      case 'retract':
        for (const [who, list] of Object.entries(threads)) {
          const b = list.find((x) => x.id === s.target);
          if (b) {
            b.retracted = true;
            b.retractedAt = time || undefined;
            thread = who;
          }
        }
        break;
      case 'choose': {
        const pick = choices[i];
        if (pick === undefined) break;
        const o = s.options[pick];
        if (s.mode === 'chat') {
          push(thread ?? '', { mine: true, text: o.text, retracted: false });
          for (const t of o.then) push(t.who, { mine: false, text: t.text, retracted: false });
        } else {
          talk.push({ who: scene.owner, text: o.text }, ...o.then);
        }
        break;
      }
      case 'talk':
        talk.push({ who: s.who, text: s.text });
        break;
    }
  }
  const current = scene.steps[last];
  return {
    time,
    screen: screenOf(current),
    step: current,
    thread,
    threads,
    talk,
    chosen: current.do === 'choose' ? (choices[last] ?? null) : null,
  };
}

/** 目前這一步能不能直接往下（choose 要先選）。 */
export function canAdvance(scene: PhoneScene, step: number, choices: Record<number, number>) {
  const s = scene.steps[step];
  return !s || s.do !== 'choose' || choices[step] !== undefined;
}

/**
 * 演完最後一步之後的警方現場照片（設定集 05-05）是這一場多出來的最後一頁，步數接在劇本後面。
 * 沒有照片的手機場景照舊在最後一步結束。
 */
export const photosStep = (scene: PhoneScene) =>
  scene.photos?.length ? scene.steps.length : undefined;

export const lastStep = (scene: PhoneScene) => photosStep(scene) ?? scene.steps.length - 1;
