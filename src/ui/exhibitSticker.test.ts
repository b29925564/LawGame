import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExhibitSticker } from './ExhibitSticker';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const xs = (props: Parameters<typeof ExhibitSticker>[0]) => createElement(ExhibitSticker, props);

describe('證物貼紙', () => {
  it('辯方、供辨識：只有貼紙、沒有章', () => {
    const h = html(xs({ no: '①' }));
    expect(h).toContain('class="xs def enter"');
    expect(h).toContain('辯方證物 ①，供辨識');
    expect(h).not.toContain('class="stamp');
  });
  it('採納後：供辨識劃掉，蓋「已採納」章', () => {
    const h = html(xs({ no: '②', admitted: true, still: true }));
    expect(h).toContain('xs def admitted');
    expect(h).toContain('<s class="xs-st">供辨識</s>');
    expect(h).toContain('已採納');
    expect(h).toContain('class="stamp sm"');
    expect(h).toContain('辯方證物 ②，已採納');
  });
  it('檢方貼紙用 state 樣式', () => {
    const h = html(xs({ no: '①', side: 'state' }));
    expect(h).toContain('xs state');
    expect(h).toContain('檢方證物 ①，供辨識');
  });
});
