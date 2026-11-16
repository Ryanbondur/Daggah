/**
 * Read a JSON request body while enforcing a byte ceiling during the read,
 * so oversized payloads cannot force the whole body into memory first.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) throw new Error('too_large');
  }

  const body = request.body;
  if (!body) return {};

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore cancel errors */
      }
      throw new Error('too_large');
    }
    chunks.push(value);
  }

  if (total === 0) return {};

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(merged);
  if (!text) return {};
  return JSON.parse(text) as unknown;
}
