import { createApp } from './app';
import { config } from './config';
import { closeDb, connect } from './db';

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`[api] KubeLab API escuchando en :${config.port} (${config.nodeEnv})`);
  });

  // La conexión a BD no bloquea el arranque: /health responde aunque Postgres aún no esté listo.
  void connect();

  const shutdown = (signal: string) => {
    console.log(`[api] ${signal} recibido, cerrando...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    // Forzar salida si quedan conexiones colgadas (terminationGracePeriodSeconds por defecto = 30s).
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] Error fatal al iniciar:', err);
  process.exit(1);
});
