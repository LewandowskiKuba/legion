// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL client – pool połączeń
// Konfigurowalny przez DATABASE_URL w .env
// Gdy DATABASE_URL nie jest ustawione → tryb offline (dane z pliku JSON)
// ─────────────────────────────────────────────────────────────────────────────

import pg from "pg";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (!process.env.DATABASE_URL) return null;

  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    _pool.on("error", (err) => {
      console.error("⚠ PostgreSQL pool error:", err.message);
    });
  }

  return _pool;
}

export async function query(
  sql: string,
  params?: any[]
): Promise<pg.QueryResult<any>> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_URL nie jest ustawione");
  return pool.query(sql, params);
}

export async function isDbAvailable(): Promise<boolean> {
  try {
    const pool = getPool();
    if (!pool) return false;
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
