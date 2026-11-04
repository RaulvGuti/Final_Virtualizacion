import express, { NextFunction, Request, Response } from 'express';
import { getRepository, isDbConnected } from './db';
import { metricsHandler, metricsMiddleware } from './metrics';
import { itemsRouter } from './routes/items';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(metricsMiddleware);

  // Liveness/readiness: siempre 200 mientras el proceso esté sano, aunque la BD no responda.
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: isDbConnected() ? 'connected' : 'disconnected',
      storage: getRepository().kind,
    });
  });

  app.get('/metrics', metricsHandler);

  app.use('/api/v1/items', itemsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON malformado' });
      return;
    }
    console.error('[api] Error no controlado:', err);
    res.status(err.status ?? 500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
