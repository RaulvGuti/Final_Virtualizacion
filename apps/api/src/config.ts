function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: toInt(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'kubelab',
    connectTimeoutMs: toInt(process.env.DB_CONNECT_TIMEOUT_MS, 3000),
    retryIntervalMs: toInt(process.env.DB_RETRY_INTERVAL_MS, 10000),
  },
} as const;
