import { describe, expect, it } from 'vitest';
import { cardImage } from './schema';

/** 物品卡縮圖只收打包內的相對路徑（上線前審查 S7，Issue #380）。 */
describe('卡片縮圖路徑', () => {
  it('打包內的相對路徑可以', () => {
    for (const p of ['phone.webp', 'cards/phone.webp', 'cards/ep1/receipt_01.PNG', 'a/b-c/d.jpeg'])
      expect(cardImage.safeParse(p).success, p).toBe(true);
  });

  it('網址、/ 開頭、.. 和不是圖片的副檔名都擋下來', () => {
    for (const p of [
      'https://example.com/x.png',
      'http://example.com/x.png',
      '//example.com/x.png',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      '/cards/phone.webp',
      '../secret.png',
      'cards/../../x.png',
      'cards/phone.svg',
      'cards/phone',
      '',
    ])
      expect(cardImage.safeParse(p).success, p).toBe(false);
  });
});
