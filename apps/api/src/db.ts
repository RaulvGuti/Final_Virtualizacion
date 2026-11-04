import { Pool } from 'pg';
import { config } from './config';
import { dbUp } from './metrics';
import { MemoryItemRepository } from './repositories/memoryRepository';
import { PostgresItemRepository } from './repositories/postgresRepository';
import { ItemRepository } from './types';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)   NOT NULL,
  description TEXT,
  quantity    INTEGER        NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  price       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);`;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 10,
  connectionTimeoutMillis: config.db.connectTimeoutMs,
  idleTimeoutMillis: 30000,
});

// Evita que un error en un cliente inactivo (p.ej. reinicio de Postgres) tumbe el proceso.
pool.on('error', (err) => {
  console.error('[db] Error en cliente inactivo del pool:', err.message);
  markDisconnected();
});

const memoryRepo = new MemoryItemRepository();
const postgresRepo = new PostgresItemRepository(pool);

let connected = false;
let retryTimer: NodeJS.Timeout | null = null;

function markDisconnected(): void {
  if (connected) console.warn('[db] Conexión perdida. Usando almacenamiento en memoria.');
  connected = false;
  dbUp.set(0);
  scheduleRetry();
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, config.db.retryIntervalMs);
  retryTimer.unref();
}

/**
 * Intenta conectar a PostgreSQL y crear el esquema. Nunca lanza:
 * si falla, la API sigue funcionando con el repositorio en memoria y reintenta en segundo plano.
 */
export async function connect(): Promise<void> {
  try {
    await pool.query(SCHEMA_SQL);
    if (!connected) {
      console.log(`[db] Conectado a PostgreSQL en ${config.db.host}:${config.db.port}/${config.db.database}`);
    }
    connected = true;
    dbUp.set(1);
  } catch (err) {
    console.warn(
      `[db] PostgreSQL no disponible (${(err as Error).message}). ` +
        `Fallback en memoria; reintento en ${config.db.retryIntervalMs} ms.`,
    );
    connected = false;
    dbUp.set(0);
    scheduleRetry();
  }
}

export function isDbConnected(): boolean {
  return connected;
}

export function getRepository(): ItemRepository {
  return connected ? postgresRepo : memoryRepo;
}

/** Ejecuta una operación; si falla por conexión, marca la BD como caída y reintenta en memoria. */
export async function withRepository<T>(op: (repo: ItemRepository) => Promise<T>): Promise<T> {
  const repo = getRepository();
  try {
    return await op(repo);
  } catch (err) {
    if (repo.kind === 'postgres' && isConnectionError(err)) {
      markDisconnected();
      return op(memoryRepo);
    }
    throw err;
  }
}

function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const codes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P03', '08006', '08001'];
  return (e.code !== undefined && codes.includes(e.code)) || /timeout|terminated|Connection/i.test(e.message ?? '');
}

export async function closeDb(): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  await pool.end().catch(() => undefined);
}
