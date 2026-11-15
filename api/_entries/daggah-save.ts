/**
 * Hosted save entry (bundled into api/daggah-save.js).
 * Edit api/_lib/* then run: node scripts/bundle-api.mjs
 */
export const runtime = 'nodejs';
export { GET, PUT, OPTIONS } from '../_lib/saveApi';
