/**
 * Username/password auth API for cloud saves.
 * Handlers live in api/_lib so the host packs them with this function
 * (imports from ../src/lib are not available under /var/task).
 */
export const runtime = 'nodejs';

export { GET, POST, OPTIONS } from './_lib/authApi';
