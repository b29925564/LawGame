import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * 預載只碰 firm-morning 要用的主檔（沒有 unicode-range 的那份）：先 Noto Serif TC 400（第一句旁白），
 * 再 Noto Sans TC 500／400／700。首屏、補充檔、其他字重與字族都不動。
 */
describe('warmMainFonts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('標題畫完、閒下來才載；旁白的明體主檔先，黑體主檔後', async () => {
    const order: string[] = [];
    const face = (family: string, weight: string, unicodeRange = 'U+0-10FFFF') => {
      const f = {
        family,
        weight,
        unicodeRange,
        status: 'unloaded',
        load: vi.fn(() => {
          order.push(`${family.replace(/"/g, '')} ${weight}`);
          return Promise.resolve();
        }),
      };
      return f;
    };
    const faces = [
      face('Noto Sans TC', '400', 'U+3400-4DBF, U+4E00-9FFF'),
      face('Noto Sans TC', '400'),
      face('Noto Sans TC', '400', 'U+20-7E, U+4E00'),
      face('"Noto Sans TC"', '500'),
      face('Noto Sans TC', '700'),
      face('Noto Serif TC', '400'),
      face('Noto Serif TC', '700'),
      face('IBM Plex Sans', '400', 'U+0-FF'),
    ];
    let idle: (() => void) | undefined;
    vi.stubGlobal('document', { fonts: Object.assign(faces, { ready: Promise.resolve() }) });
    vi.stubGlobal('window', { requestIdleCallback: (cb: () => void) => (idle = cb) });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => cb());
    const { warmMainFonts } = await import('./warm');
    warmMainFonts();
    await Promise.resolve();
    expect(order).toEqual([]);
    idle!();
    await vi.waitFor(() => expect(order).toHaveLength(4));
    expect(order).toEqual([
      'Noto Serif TC 400',
      'Noto Sans TC 400',
      'Noto Sans TC 500',
      'Noto Sans TC 700',
    ]);
    // 再呼叫一次（回標題）不重複排程。
    idle = undefined;
    warmMainFonts();
    await Promise.resolve();
    expect(idle).toBeUndefined();
  });
});
