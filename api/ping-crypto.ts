/** Probe: Web Crypto (no node:crypto) on the hosted runtime. */
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('daggah'));
    const hex = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 8);
    return Response.json(
      { ok: true, probe: 'crypto', digest: hex },
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
