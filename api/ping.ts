/** Minimal health check — no DB / crypto imports (isolates FUNCTION_INVOCATION_FAILED). */
export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true, service: 'daggah' },
    { status: 200, headers: { 'cache-control': 'private, no-store' } },
  );
}
