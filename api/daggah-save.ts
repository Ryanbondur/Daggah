/**
 * Thin hosted entry for /api/daggah-save.
 * Heavy deps load inside the handler so import failures become JSON 500s.
 */
const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function loadFailed(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  console.error('daggah-save load/run failed', name, message);
  return Response.json(
    {
      error: 'internal',
      hint: 'Cloud sync failed to start. Progress stays on this device.',
      detail: `${name}: ${message}`.slice(0, 240),
    },
    { status: 500, headers: NO_STORE },
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    const mod = await import('../src/lib/saveApi');
    return await mod.GET(request);
  } catch (error) {
    return loadFailed(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const mod = await import('../src/lib/saveApi');
    return await mod.PUT(request);
  } catch (error) {
    return loadFailed(error);
  }
}

export async function OPTIONS(): Promise<Response> {
  try {
    const mod = await import('../src/lib/saveApi');
    return await mod.OPTIONS();
  } catch (error) {
    return loadFailed(error);
  }
}
