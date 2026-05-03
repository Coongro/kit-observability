import type { Sql } from 'postgres';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

/**
 * Versión actual del schema del plugin. Bumpear cuando se agreguen migrations
 * en `migrations/` y agregar el case correspondiente en `applyMigrations()`.
 *
 * Sin esto, el segundo cambio de schema en este plugin se vuelve un "ALTER
 * TABLE IF NOT EXISTS" suelto sin orden ni reentry safety. Implementado de
 * arranque para que la deuda no exista.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_VERSION_TABLE = 'schema_version';

const TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${SCHEMA_VERSION_TABLE}"`;

export const CREATE_SCHEMA_VERSION_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)
`.trim();

/** Devuelve la versión persistida o null si la tabla está vacía (primera install). */
export async function readVersion(raw: Sql): Promise<number | null> {
  const rows = await raw.unsafe<{ version: number }[]>(
    `SELECT version FROM ${TABLE} WHERE id = 1`
  );
  return rows[0]?.version ?? null;
}

/** Persiste la versión activa. UPSERT por id=1 (singleton). */
export async function writeVersion(raw: Sql, version: number): Promise<void> {
  await raw.unsafe(
    `INSERT INTO ${TABLE} (id, version, applied_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW()`,
    [version]
  );
}
