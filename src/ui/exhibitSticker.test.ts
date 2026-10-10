import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExhibitSticker } from './ExhibitSticker';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const xs = (props: Parameters<typeof ExhibitSticker>[0]) => createElement(ExhibitSticker, props);

describe('證物貼紙', () => {
  it('辯方、供辨識：四個欄位，沒有章，編號不用圈起來的數字', () => {
    const h = html(xs({ no: '1' }));
    expect(h).toContain('class="xs def enter"');
    expect(h).toContain('辯方證物 1，供辨識');
    expect(h).toContain('class="xs-no">1<');
    expect(h).toContain('class="xs-case"');
    expect(h).toContain('class="xs-dv"');
    expect(h).not.toContain('class="stamp');
    expect(h).not.toMatch(/[①-⑳]/);
  });
  it('採納後：供辨識劃掉，章蓋在標籤上並帶日期', () => {
    const h = html(xs({ no: '2', admitted: true, date: '03/24/2026', still: true }));
    expect(h).toContain('xs def admitted');
    expect(h).toContain('data-admitted="true"');
    expect(h).toContain('已採納');
    expect(h).toContain('03/24/2026');
    expect(h).toContain('辯方證物 2，已採納 03/24/2026');
  });
  it('劇本沒給日期就不印日期', () => {
    const h = html(xs({ no: '1', admitted: true, still: true }));
    expect(h).toContain('已採納');
    expect(h).not.toMatch(/\d\d\/\d\d\/\d{4}/);
  });
  it('檢方貼紙用 state 樣式', () => {
    const h = html(xs({ no: '1', side: 'state' }));
    expect(h).toContain('xs state');
    expect(h).toContain('檢方證物 1，供辨識');
  });
  it('證據欄 chip：只有編號和狀態，外框、不是貼紙', () => {
    const h = html(xs({ no: '1', chip: true }));
    expect(h).toContain('xs-chip');
    expect(h).not.toContain('class="xs ');
    expect(h).not.toContain('xs-case');
  });
});
