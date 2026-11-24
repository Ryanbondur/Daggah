/**
 * Hosted 4v4 matchmaking entry (bundled into api/daggah-match.js).
 * Edit api/_lib/* then run: node scripts/bundle-api.mjs
 */
export const runtime = 'nodejs';
export { POST, OPTIONS } from '../_lib/matchApi';
