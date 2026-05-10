import type { SystemDatabase } from '@coongro/database-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { loadConfig } from '../config.js';
import { registerPartitions } from '../partitions/register.js';
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
 * Compañero simétrico de `resetObservabilitySchema`: deja la DB en el mismo
 * estado funcional que `activate()` produce en producción — schema + DDL +
 * partman registrado para `log_entries` y `log_spans`.
 *
 * Por qué no basta con `runBootstrap`: el DDL declara las tablas como
 * `PARTITION BY RANGE`, pero las particiones hijas las crea `partman.create_parent`
 * vía `registerPartitions`. Si un test setup hace solo `reset + runBootstrap`,
 * deja log_entries/log_spans particionadas SIN children attached y cualquier
 * INSERT subsiguiente falla con "no partition of relation X found for row".
 *
 * Esto importa incluso para tests que no tocan log_entries/log_spans, porque
 * los integration tests corren contra una DB compartida (`OBSERVABILITY_TEST_DB_URL`)
 * y el siguiente test — o el API en runtime apuntando a la misma DB — sí
 * puede insertar. Setup simétrico al reset evita el envenenamiento entre
 * suites.
 *
 * Usa `loadConfig({})` (defaults) — los tests que necesitan retentions custom
 * pueden re-llamar `registerPartitions(sql, customConfig, ...)` después; partman
 * es idempotente.
 *
 * NO usar en `bootstrap.integration.test.ts`: ese archivo testea `runBootstrap`
 * en aislamiento y no debe acoplarse a `registerPartitions`.
 */
export async function setupObservabilitySchema(sql: Sql): Promise<void> {
  await runBootstrap(sql, silentLogger);
  await registerPartitions(sql, loadConfig({}), silentLogger);
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

/**
 * Crea un SystemDatabase mínimo para tests de integración.
 * Envuelve una conexión postgres.js con un `ormQuery` compatible con el
 * contrato de SystemDatabase — sin necesidad de levantar el stack completo.
 */
export function createTestSystemDatabase(sql: Sql): SystemDatabase {
  const db = drizzle(sql);
  return {
    raw: sql,
    orm: db as unknown as SystemDatabase['orm'],
    ormQuery: <T>(fn: (d: typeof db) => Promise<T>): Promise<T> => fn(db),
  };
}

export interface SilentLogger {
  // Variadic para satisfacer cualquier firma (info(msg, meta), error(msg, err, meta), etc.)
  // sin tener que mantener este tipo en sync con cada interface consumidora.
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Logger no-op que satisface las interfaces de bootstrap/registerPartitions/AuditLog. */
export const silentLogger: SilentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
