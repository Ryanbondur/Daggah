import type { IncomingMessage, ServerResponse } from 'node:http';
import { GET, OPTIONS, PUT } from '../../api/daggah-save';

/** Convert a Node IncomingMessage into a web Request for local Vite / start adapters. */
export async function nodeToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? '127.0.0.1';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  if (!hasBody) {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return new Request(url, {
    method,
    headers,
    body: Buffer.concat(chunks),
  });
}

export async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

/** Route /api/daggah-save through the web handlers. Returns false if not this path. */
export async function handleDaggahSaveApi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0];
  if (path !== '/api/daggah-save') return false;

  const request = await nodeToWebRequest(req);
  let response: Response;
  switch (req.method) {
    case 'GET':
      response = await GET(request);
      break;
    case 'PUT':
      response = await PUT(request);
      break;
    case 'OPTIONS':
      response = await OPTIONS();
      break;
    default:
      response = Response.json(
        { error: 'method_not_allowed' },
        { status: 405, headers: { allow: 'GET, PUT, OPTIONS', 'cache-control': 'private, no-store' } },
      );
  }
  await writeWebResponse(res, response);
  return true;
}
