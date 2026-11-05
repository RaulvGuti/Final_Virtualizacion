import fs from "fs";
import path from "path";
import { pool } from "../config/db";

const SQL_CANDIDATES = [
  path.join(__dirname, "init.sql"),
  path.join(__dirname, "../../src/db/init.sql"),
  path.join(process.cwd(), "src/db/init.sql"),
];

function loadInitSql(): string {
  for (const candidate of SQL_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8");
    }
  }

  throw new Error(
    `No se encontro el script de inicializacion. Rutas buscadas: ${SQL_CANDIDATES.join(
      ", "
    )}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initDatabase(
  retries = 10,
  delayMs = 3000
): Promise<boolean> {
  const sql = loadInitSql();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      await pool.query(sql);
      console.log("Base de datos inicializada: tabla products lista");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Intento ${attempt}/${retries} de conexion a la base de datos fallido: ${message}`
      );

      if (attempt === retries) {
        console.error(
          "No se pudo inicializar la base de datos. La API continuara en ejecucion."
        );
        return false;
      }

      await sleep(delayMs);
    }
  }

  return false;
}
