import { useEffect, useState } from 'react';
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
