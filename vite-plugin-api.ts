import type { Plugin } from 'vite';
import { handleDaggahSaveApi } from './src/lib/httpAdapter';

/** Local-dev + preview middleware: /api/daggah-save → web Request handlers. */
export function daggahApiPlugin(): Plugin {
  return {
    name: 'daggah-api',
    configureServer(server) {
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
    configurePreviewServer(server) {
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
