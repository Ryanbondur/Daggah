/**
 * Cloud save API — GET/PUT /api/daggah-save
 * Static re-export so the hosted bundler inlines src/lib into this function.
 */
export const runtime = 'nodejs';

export { GET, PUT, OPTIONS } from '../src/lib/saveApi';
