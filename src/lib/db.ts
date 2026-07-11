import Database from "@tauri-apps/plugin-sql";

// Conexão única com o SQLite local (arquivo em AppData, gerenciado pelo Tauri).
let _db: Promise<Database> | null = null;
export function getDb(): Promise<Database> {
  if (!_db) _db = Database.load("sqlite:dash.db");
  return _db;
}

export async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

export async function one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  const db = await getDb();
  await db.execute(sql, params);
}

/** UUID v4 gerado localmente (equivalente ao default do Postgres). */
export function uid(): string {
  return crypto.randomUUID();
}

/** Timestamp ISO 8601 com Z — mesmo formato que o app já espera do Supabase. */
export function nowIso(): string {
  return new Date().toISOString();
}
