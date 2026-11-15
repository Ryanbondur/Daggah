/**
 * Probe: DATABASE_URL / hosted env flags (no src/lib import — dynamic src imports
 * fail on the host; keep this self-contained).
 */
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      probe: 'db',
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
      hasCursorAppId: Boolean(process.env.CURSOR_APP_ID),
      hasVercel: Boolean(process.env.VERCEL),
    },
    { status: 200, headers: { 'cache-control': 'private, no-store' } },
  );
}
