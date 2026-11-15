/**
 * Thin hosted entry for /api/daggah-auth.
 * Heavy deps (crypto, pg) load inside the handler so import failures become JSON 500s
 * instead of platform FUNCTION_INVOCATION_FAILED.
 */
const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function loadFailed(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  console.error('daggah-auth load/run failed', name, message);
  return Response.json(
    {
      error: 'internal',
      hint: 'Cloud login failed to start. Try guest play, or retry in a moment.',
      detail: `${name}: ${message}`.slice(0, 240),
    },
    { status: 500, headers: NO_STORE },
  );
}

export async function GET(request: Request): Promise<Response> {
  try {
    const mod = await import('../src/lib/authApi');
    return await mod.GET(request);
  } catch (error) {
    return loadFailed(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const mod = await import('../src/lib/authApi');
    return await mod.POST(request);
  } catch (error) {
    return loadFailed(error);
  }
}

export async function OPTIONS(): Promise<Response> {
  try {
    const mod = await import('../src/lib/authApi');
    return await mod.OPTIONS();
  } catch (error) {
    return loadFailed(error);
  }
}
