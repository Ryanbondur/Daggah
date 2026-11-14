/** Escape text before interpolating into HTML (content or attributes). */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remove HTML/XML tags and leftover angle brackets. */
export function stripTags(value: string): string {
  return String(value)
    .replace(/<\/?[^>]*>/g, '')
    .replace(/[<>]/g, '');
}

/**
 * Strip tags + control chars, trim, and cap length.
 * Use for user-controlled or save-imported display strings before storage.
 */
export function sanitizePlainText(value: string, maxLen: number): string {
  return stripTags(value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, Math.max(0, maxLen));
}

/** Restrict ids used in DOM data-* attributes to a safe charset. */
export function sanitizeDomId(value: string, maxLen = 64): string {
  const cleaned = String(value)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, Math.max(1, maxLen));
  return cleaned || 'id';
}
