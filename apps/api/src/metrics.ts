import { NextFunction, Request, Response } from 'express';
import client from 'prom-client';

export const register = new client.Registry();
register.setDefaultLabels({ app: 'kubelab-api' });

// Métricas por defecto: CPU (process_cpu_*), memoria (process_resident_memory_bytes,
// nodejs_heap_*), event loop lag, GC, handles, etc.
client.collectDefaultMetrics({ register });

// Contador total -> peticiones por segundo con: rate(http_requests_total[1m])
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Número total de peticiones HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

// Histograma de latencia -> p95 con: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latencia de las peticiones HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Peticiones HTTP en curso',
  registers: [register],
});

export const dbUp = new client.Gauge({
  name: 'kubelab_db_up',
  help: '1 si la API está conectada a PostgreSQL, 0 si usa el fallback en memoria',
  registers: [register],
});

/** Usa la ruta parametrizada (/api/v1/items/:id) para evitar explosión de cardinalidad. */
function routeLabel(req: Request): string {
  if (req.route?.path) {
    const path = req.route.path === '/' && req.baseUrl ? '' : req.route.path;
    return `${req.baseUrl}${path}`;
  }
  return 'unmatched';
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/metrics') return next();

  httpRequestsInFlight.inc();
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const labels = { method: req.method, route: routeLabel(req), status_code: String(res.statusCode) };
    end(labels);
    httpRequestsTotal.inc(labels);
    httpRequestsInFlight.dec();
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
