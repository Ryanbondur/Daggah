/**
 * Cloud save API — GET/PUT /api/daggah-save
 * Handlers live in api/_lib so the host packs them with this function.
 */
export const runtime = 'nodejs';

export { GET, PUT, OPTIONS } from './_lib/saveApi';
