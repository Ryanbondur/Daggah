/**
 * Copy text to the clipboard with Clipboard API + iOS Safari-friendly fallback.
 * Prefer calling from a user-gesture handler (tap/click).
 */
export async function copyTextToClipboard(
  text: string,
  preferEl?: HTMLTextAreaElement | HTMLInputElement | null,
): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // iOS Safari / insecure contexts / denied permission → fall through
    }
  }

  return copyViaExecCommand(text, preferEl ?? undefined);
}

function copyViaExecCommand(
  text: string,
  preferEl?: HTMLTextAreaElement | HTMLInputElement,
): boolean {
  if (typeof document === 'undefined') return false;

  try {
    if (preferEl) {
      preferEl.focus();
      preferEl.select();
      preferEl.setSelectionRange(0, preferEl.value.length);
      if (document.execCommand('copy')) return true;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Keep on-screen (opacity 0) — off-screen nodes often fail on iOS Safari.
    ta.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;margin:0;border:0;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
