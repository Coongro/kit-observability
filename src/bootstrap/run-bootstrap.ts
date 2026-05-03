import type { Sql } from 'postgres';

import {
  CREATE_LOG_ENTRIES_INDEXES_SQL,
  CREATE_LOG_ENTRIES_SQL,
  CREATE_LOG_ISSUES_INDEXES_SQL,
  CREATE_LOG_ISSUES_SQL,
  CREATE_LOG_SPANS_INDEXES_SQL,
  CREATE_LOG_SPANS_SQL,
  CREATE_SCHEMA_SQL,
  ENSURE_PGCRYPTO_SQL,
} from './ddl.js';
import {
  CREATE_SCHEMA_VERSION_SQL,
  SCHEMA_VERSION,
  readVersion,
  writeVersion,
} from './schema-version.js';

export interface BootstrapLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Ejecuta el DDL idempotente del plugin. Llamado desde `activate()`.
 *
 * Flujo:
 *   1. CREATE EXTENSION pgcrypto (idempotente, para gen_random_uuid).
 *   2. CREATE SCHEMA observability + tabla schema_version (también idempotentes).
 *   3. Lee la versión persistida. Si null → primera install: aplica el DDL de
 *      v1 dentro de UNA transacción + escribe schema_version atómicamente.
 *      Si == SCHEMA_VERSION → no-op.
 *      Si < SCHEMA_VERSION → en el futuro habrá `applyMigrations(from, to)`;
 *      por ahora throws (defensa contra deploys raros).
 *      Si > SCHEMA_VERSION → plugin downgradeado, log warn y skip — el
 *      higher-version schema puede tener cambios incompatibles que esta
 *      versión del plugin no entiende; INSERTs subsiguientes pueden fallar.
 *
 * Atomicidad: si applyV1 falla a mitad de camino (ej: una de las CREATE INDEX),
 * la transacción se rollbackea ENTERA y schema_version queda sin escribir →
 * el siguiente boot re-intenta desde 0. Sin esta transacción, un fallo parcial
 * dejaba al plugin permanentemente bricked (tablas a medias + constraint
 * conflicts en re-attempts).
 *
 * IMPORTANTE: este bootstrap solo crea las tablas parent (con PARTITION BY).
 * La creación de las particiones diarias y el maintenance corre aparte vía
 * `partitions/register.ts` que llama `partman.create_parent(...)`.
 */
export async function runBootstrap(raw: Sql, logger: BootstrapLogger): Promise<void> {
  // pgcrypto y schema observability se crean fuera de transacción porque CREATE
  // EXTENSION puede tener side-effects globales y los CREATE SCHEMA/TABLE de
  // schema_version necesitan poder leerse antes de la transacción de v1.
  await raw.unsafe(ENSURE_PGCRYPTO_SQL);
  logger.info('pgcrypto extension ensured');

  await raw.unsafe(CREATE_SCHEMA_SQL);
  logger.info('schema observability ensured');

  await raw.unsafe(CREATE_SCHEMA_VERSION_SQL);

  const current = await readVersion(raw);

  if (current === null) {
    logger.info(`first install — applying schema v${SCHEMA_VERSION}`);
    await raw.begin(async (tx) => {
      await applyV1(tx as unknown as Sql, logger);
      await writeVersion(tx as unknown as Sql, SCHEMA_VERSION);
    });
    logger.info(`schema v${SCHEMA_VERSION} applied (transactional)`);
    return;
  }

  if (current === SCHEMA_VERSION) {
    logger.info(`schema already at v${current}, no migration needed`);
    return;
  }

  if (current < SCHEMA_VERSION) {
    throw new Error(
      `[kit-observability] schema_version ${current} < plugin SCHEMA_VERSION ${SCHEMA_VERSION}, ` +
        `but no migrations are registered yet. Add a migration in bootstrap/migrations/ and bump SCHEMA_VERSION.`
    );
  }

  // current > SCHEMA_VERSION — plugin downgradeado.
  // No re-aplicamos v1: el schema higher-version puede tener columnas
  // incompatibles que romperían los CREATE TABLE IF NOT EXISTS implícitos.
  // El warn comunica claramente que es best-effort: callers no deberían
  // downgradear en producción.
  logger.warn(
    `schema at v${current} but plugin expects v${SCHEMA_VERSION}; downgrade detected — skipping bootstrap. Subsequent INSERTs may fail if the higher-version schema is incompatible with this plugin version.`
  );
}

async function applyV1(raw: Sql, logger: BootstrapLogger): Promise<void> {
  const tables: { name: string; createSql: string; indexesSql: readonly string[] }[] = [
    {
      name: 'log_entries',
      createSql: CREATE_LOG_ENTRIES_SQL,
      indexesSql: CREATE_LOG_ENTRIES_INDEXES_SQL,
    },
    {
      name: 'log_spans',
      createSql: CREATE_LOG_SPANS_SQL,
      indexesSql: CREATE_LOG_SPANS_INDEXES_SQL,
    },
    {
      name: 'log_issues',
      createSql: CREATE_LOG_ISSUES_SQL,
      indexesSql: CREATE_LOG_ISSUES_INDEXES_SQL,
    },
  ];

  for (const { name, createSql, indexesSql } of tables) {
    await raw.unsafe(createSql);
    for (const stmt of indexesSql) {
      await raw.unsafe(stmt);
    }
    logger.info(`table ${name} created`);
  }
}
