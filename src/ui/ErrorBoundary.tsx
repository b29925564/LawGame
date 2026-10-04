import { Component, type ReactNode } from 'react';
import { useEpisode } from '../engine/game';

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
    useEpisode.getState().toTitle();
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
