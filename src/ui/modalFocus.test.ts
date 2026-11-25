/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { activateModalFocus, getFocusable, modalPanel } from './modalFocus';

describe('modalFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lists enabled focusables and skips aria-disabled', () => {
    document.body.innerHTML = `
      <div id="root">
        <button type="button">A</button>
        <button type="button" disabled>B</button>
        <button type="button" aria-disabled="true">C</button>
        <input type="text" />
        <div tabindex="0">D</div>
        <div tabindex="-1">E</div>
      </div>`;
    const root = document.getElementById('root')!;
    const ids = getFocusable(root).map((el) => el.textContent || el.tagName);
    expect(ids).toEqual(['A', 'INPUT', 'D']);
  });

  it('prefers role=dialog, then sheet / cmp-wrap', () => {
    document.body.innerHTML = `<div id="dim"><div class="sheet" role="dialog" id="d"></div></div>`;
    expect(modalPanel(document.getElementById('dim')!).id).toBe('d');

    document.body.innerHTML = `<div id="dim"><div class="cmp-wrap" id="c"></div></div>`;
    expect(modalPanel(document.getElementById('dim')!).id).toBe('c');
  });

  it('focuses the first control and cycles Tab / Shift+Tab', () => {
    document.body.innerHTML = `
      <div id="dim">
        <div class="sheet" role="dialog">
          <button type="button" id="a">A</button>
          <button type="button" id="b">B</button>
        </div>
      </div>`;
    const dim = document.getElementById('dim')!;
    const handle = activateModalFocus(dim);
    return Promise.resolve().then(() => {
      expect(document.activeElement?.id).toBe('a');
      dim.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      // native Tab moves; our trap only wraps at ends — jump from last
      document.getElementById('b')!.focus();
      dim.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement?.id).toBe('a');
      dim.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
      );
      expect(document.activeElement?.id).toBe('b');
      handle.release({ restore: false });
    });
  });

  it('Escape calls onEscape', () => {
    document.body.innerHTML = `<div id="dim"><div class="sheet"><button type="button">X</button></div></div>`;
    const dim = document.getElementById('dim')!;
    let n = 0;
    const handle = activateModalFocus(dim, { onEscape: () => n++ });
    dim.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(n).toBe(1);
    handle.release({ restore: false });
  });
});
