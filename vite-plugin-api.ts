import type { Plugin } from 'vite';
import { handleDaggahSaveApi } from './src/lib/httpAdapter';

/** Local-dev + preview middleware: /api/daggah-save + /api/daggah-auth → web Request handlers. */
export function daggahApiPlugin(): Plugin {
  return {
    name: 'daggah-api',
    async configureServer(server) {
      // Register in-memory PGlite before any API hit (not used on the hosted publish build).
      await import('./src/lib/dbPglite');
      server.middlewares.use(async (req, res, next) => {
        try {
          if (await handleDaggahSaveApi(req, res)) return;
        } catch (error) {
          console.error('daggah api middleware', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'internal' }));
          return;
        }
        next();
      });
    },
    async configurePreviewServer(server) {
      await import('./src/lib/dbPglite');
      server.middlewares.use(async (req, res, next) => {
        try {
          if (await handleDaggahSaveApi(req, res)) return;
        } catch (error) {
          console.error('daggah api preview middleware', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'internal' }));
          return;
        }
        next();
      });
    },
  };
}
