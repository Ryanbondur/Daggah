/**
 * Hosted auth entry (bundled into api/daggah-auth.js).
 * Edit api/_lib/* then run: node scripts/bundle-api.mjs
 */
export const runtime = 'nodejs';
export { GET, POST, OPTIONS } from '../_lib/authApi';
