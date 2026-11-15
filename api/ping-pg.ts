/** Probe: can the hosted runtime dynamic-import the `pg` package? */
export async function GET(): Promise<Response> {
  try {
    const mod = await import('pg');
    const hasPool = typeof mod.default?.Pool === 'function';
    return Response.json(
      { ok: true, probe: 'pg', hasPool },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        probe: 'pg',
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}