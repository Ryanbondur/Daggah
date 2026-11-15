/**
 * Username/password auth API for cloud saves.
 * POST /api/daggah-auth  body: { action: 'register'|'login'|'logout'|'change-password', ... }
 * GET  /api/daggah-auth  → current session (me)
 *
 * Static re-export so the hosted bundler inlines src/lib into this function.
 * Dynamic import('../src/lib/...') fails at runtime: /var/task has no separate src modules.
 */
export const runtime = 'nodejs';

export { GET, POST, OPTIONS } from '../src/lib/authApi';
