import postgres from 'postgres';
import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

/**
 * Helpers compartidos entre tests de integración.
 *
 * Los tests requieren `OBSERVABILITY_TEST_DB_URL` seteada (no hay default a
 * la dev DB para evitar borrar el schema observability del usuario sin querer).
 * Si no está, los tests se SKIPpean con un mensaje claro.
 *
 * Format esperado:
 *   `postgres://coongro:coongro_dev_password@localhost:5432/coongro_dev`
 */
export function getTestDbUrl(): string | null {
  return process.env.OBSERVABILITY_TEST_DB_URL ?? null;
}

export function createTestSql(): Sql {
  const url = getTestDbUrl();
  if (!url) {
    throw new Error(
      'OBSERVABILITY_TEST_DB_URL not set — integration tests require explicit opt-in to avoid clobbering dev DB'
    );
  }
  return postgres(url, { max: 5, onnotice: () => {} });
}

/**
 * Drop schema observability + cleanup de partman.part_config.
 *
 * El cleanup de part_config es necesario porque DROP SCHEMA CASCADE elimina
 * las tablas pero NO toca las filas de partman.part_config que las referencian.
 * Si quedan, el siguiente register.create_parent() ve que "ya está registrada"
 * y NO crea particiones — los INSERTs fallan después con "no partition found".
 *
 * Ver memoria pg_partman_quirks.md: "cleanup de part_config".
 */
export async function resetObservabilitySchema(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM partman.part_config WHERE parent_table LIKE '${OBSERVABILITY_SCHEMA_NAME}.%'`
  );
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${OBSERVABILITY_SCHEMA_NAME}" CASCADE`);
}

/**
 * Lista las particiones hijas de una tabla parent (filtra desde pg_inherits).
 * Útil para verificar que pg_partman creó las particiones diarias.
 */
export async function listChildPartitions(
  sql: Sql,
  parentSchema: string,
  parentTable: string
): Promise<string[]> {
  const rows = await sql.unsafe<{ relname: string }[]>(
    `SELECT c.relname
       FROM pg_inherits i
       JOIN pg_class p  ON p.oid = i.inhparent
       JOIN pg_class c  ON c.oid = i.inhrelid
       JOIN pg_namespace pn ON pn.oid = p.relnamespace
       JOIN pg_namespace cn ON cn.oid = c.relnamespace
      WHERE pn.nspname = $1 AND p.relname = $2
      ORDER BY c.relname`,
    [parentSchema, parentTable]
  );
  return rows.map((r) => r.relname);
}

export interface SilentLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

/** Logger no-op que satisface las interfaces de bootstrap/registerPartitions. */
export const silentLogger: SilentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
