/** Focusables inside a modal panel (buttons, links, fields, positive tabindex). */
const FOCUSABLE_SEL =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SEL)).filter((el) => {
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    // offsetParent is null for display:none; fixed/absolute in a shown tree still count.
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  });
}

/** Prefer an explicit dialog, else sheet / compare wrap. */
export function modalPanel(dim: HTMLElement): HTMLElement {
  return (
    (dim.querySelector('[role="dialog"]') as HTMLElement | null) ??
    (dim.querySelector('.sheet, .cmp-wrap, .cmp') as HTMLElement | null) ??
    dim
  );
}

export interface ModalFocusHandle {
  /** Tear down trap; optionally skip restoring prior focus (e.g. chaining modals). */
  release(opts?: { restore?: boolean }): void;
}

/**
 * Focus the first control (or the panel), trap Tab inside the dialog, Escape → onEscape.
 * Callers that set their own initial focus (e.g. login) can schedule after this microtask.
 */
export function activateModalFocus(
  dim: HTMLElement,
  opts: { onEscape?: () => void } = {},
): ModalFocusHandle {
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const panel = modalPanel(dim);
  if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;

  const focusInitial = (): void => {
    const list = getFocusable(panel);
    (list[0] ?? panel).focus({ preventScroll: true });
  };
  queueMicrotask(focusInitial);

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      if (!opts.onEscape) return;
      ev.preventDefault();
      ev.stopPropagation();
      opts.onEscape();
      return;
    }
    if (ev.key !== 'Tab') return;
    const list = getFocusable(panel);
    if (list.length === 0) {
      ev.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const i = active ? list.indexOf(active) : -1;
    if (ev.shiftKey) {
      if (i <= 0) {
        ev.preventDefault();
        list[list.length - 1].focus({ preventScroll: true });
      }
    } else if (i === list.length - 1 || i === -1) {
      ev.preventDefault();
      list[0].focus({ preventScroll: true });
    }
  };

  dim.addEventListener('keydown', onKeyDown);

  let released = false;
  return {
    release({ restore = true } = {}) {
      if (released) return;
      released = true;
      dim.removeEventListener('keydown', onKeyDown);
      if (restore && prev && document.contains(prev)) {
        prev.focus({ preventScroll: true });
      }
    },
  };
}
