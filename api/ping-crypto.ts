/** Probe: does node:crypto load on the hosted runtime? */
export async function GET(): Promise<Response> {
  try {
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update('daggah').digest('hex').slice(0, 8);
    return Response.json(
      { ok: true, probe: 'crypto', digest },
      { status: 200, headers: { 'cache-control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        probe: 'crypto',
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 500, headers: { 'cache-control': 'private, no-store' } },
    );
  }
}
