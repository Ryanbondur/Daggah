import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false for empty text', async () => {
    expect(await copyTextToClipboard('')).toBe(false);
  });

  it('uses Clipboard API when writeText resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyTextToClipboard('DGAC.abc.123')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('DGAC.abc.123');
  });

  it('falls back to execCommand when Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const execCommand = vi.fn().mockReturnValue(true);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const focus = vi.fn();
    const select = vi.fn();
    const setSelectionRange = vi.fn();
    const ta = {
      value: '',
      style: { cssText: '' },
      setAttribute: vi.fn(),
      focus,
      select,
      setSelectionRange,
    };
    vi.stubGlobal('document', {
      execCommand,
      createElement: vi.fn().mockReturnValue(ta),
      body: { appendChild, removeChild },
    });

    expect(await copyTextToClipboard('DGAC.xyz.999')).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(ta.value).toBe('DGAC.xyz.999');
  });

  it('selects preferEl when Clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('document', { execCommand, createElement: vi.fn(), body: {} });

    const preferEl = {
      value: 'DGAC.prefer.1',
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    expect(await copyTextToClipboard('DGAC.prefer.1', preferEl)).toBe(true);
    expect(preferEl.focus).toHaveBeenCalled();
    expect(preferEl.select).toHaveBeenCalled();
    expect(preferEl.setSelectionRange).toHaveBeenCalledWith(0, 'DGAC.prefer.1'.length);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
