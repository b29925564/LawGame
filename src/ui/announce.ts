/**
 * 播報佇列（設計稿 inner-voice 1.4、3.5）。所有記號的螢幕閱讀器播報都經過這裡：
 * 同一 300ms 內產生的記號合成一行，同一元件重複觸發只播最後一次；
 * 畫外字幕優先，字幕還在畫面上時，其他記號等它結束才播。
 */
export type Announcement = {
  /** 哪個元件發的，同一個 from 在同一批裡只留最後一次。 */
  from: string;
  /** 單獨播報時念的整句。 */
  text: string;
  /** 合併播報時念的短詞，例如螢光筆標的那個詞；沒有就用 text。 */
  word?: string;
};

type Timer = { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void };

export const WINDOW_MS = 300;

export function merge(items: Announcement[]): string {
  if (items.length === 1) return items[0].text;
  return `盧卡斯標記了 ${items.length} 處：${items.map((i) => i.word ?? i.text).join('、')}`;
}

export class AnnounceQueue {
  private batch: Announcement[] = [];
  private held: string[] = [];
  private timer: unknown = null;
  private vo = false;

  constructor(
    private out: (text: string) => void,
    private clock: Timer = {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    },
  ) {}

  /** 介面記號出現時呼叫。 */
  mark(a: Announcement) {
    this.batch = [...this.batch.filter((b) => b.from !== a.from), a];
    if (this.timer === null) this.timer = this.clock.set(() => this.flush(), WINDOW_MS);
  }

  /** 畫外字幕出完字時呼叫，立刻播；之後到 voiceEnd 之前，其他記號都先等著。 */
  voice(text: string) {
    this.vo = true;
    this.out(`盧卡斯沒有說出口：${text}`);
  }

  /** 畫外字幕退場時呼叫，補播等著的記號。 */
  voiceEnd() {
    this.vo = false;
    const held = this.held;
    this.held = [];
    held.forEach((t) => this.out(t));
  }

  private flush() {
    this.timer = null;
    if (!this.batch.length) return;
    const text = merge(this.batch);
    this.batch = [];
    if (this.vo) this.held.push(text);
    else this.out(text);
  }

  reset() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
    this.batch = [];
    this.held = [];
    this.vo = false;
  }
}
