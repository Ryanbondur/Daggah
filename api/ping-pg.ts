/** Probe: can the hosted runtime load postgres.js? */
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const mod = await import('postgres');
    const hasDefault = typeof mod.default === 'function';
    return Response.json(
      { ok: true, probe: 'postgres', hasDefault },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        probe: 'postgres',
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}
