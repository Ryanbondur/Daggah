/** Probe: does db.ts load (without querying) on the hosted runtime? */
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const { dbMode } = await import('../src/lib/db');
    return Response.json(
      {
        ok: true,
        probe: 'db',
        mode: dbMode(),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
        hasCursorAppId: Boolean(process.env.CURSOR_APP_ID),
        hasVercel: Boolean(process.env.VERCEL),
      },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        probe: 'db',
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}
