import { Component, type ReactNode } from 'react';
import { create } from 'zustand';
import { useEpisode } from '../engine/game';

/**
 * 剛才為什麼被送回標題（Issue #364）：標題上說一行，玩家才知道不是自己按錯、進度也還在。
 * load＝場景程式沒下載到（多半是網路斷了），error＝畫面本身出錯。標題讀過一次就清掉。
 */
export type Fault = 'error' | 'load';
export const useFault = create<{ fault: Fault | null }>(() => ({ fault: null }));

/** 動態載入失敗的訊息各瀏覽器不同：Chrome／Firefox 寫「dynamically imported module」，Safari 寫「Importing a module script failed」。 */
export const isLoadFailure = (error: unknown) =>
  error instanceof Error &&
  /dynamically imported module|Importing a module script failed/i.test(error.message);

interface State {
  failed: boolean;
  /** 連續回標題的次數：標題本身也出錯就停手，免得無限重試。 */
  retries: number;
}

/** 畫面出錯時不留白頁：記下錯誤，回到標題重畫一次。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, retries: 0 };
  private timer?: ReturnType<typeof setTimeout>;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    if (this.state.retries > 0) return;
    useFault.setState({ fault: isLoadFailure(error) ? 'load' : 'error' });
    // 直接切回標題、不經 toTitle：出錯的進度不能蓋掉上一個好的自動存檔。
    useEpisode.setState({ mode: 'title' });
    this.setState({ failed: false, retries: 1 });
  }

  componentDidUpdate() {
    // 標題畫得出來就歸零，之後再出錯仍然回標題。
    if (!this.state.failed && this.state.retries > 0 && !this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (!this.state.failed) this.setState({ retries: 0 });
      });
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
