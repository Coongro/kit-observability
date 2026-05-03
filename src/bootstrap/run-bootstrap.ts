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
}

/**
 * Ejecuta el DDL idempotente del plugin. Llamado desde `activate()`.
 *
 * Flujo:
 *   1. CREATE EXTENSION pgcrypto (idempotente, para gen_random_uuid).
 *   2. CREATE SCHEMA observability + tabla schema_version (también idempotentes).
 *   3. Lee la versión persistida. Si null → primera install: aplica el DDL de v1.
 *      Si == SCHEMA_VERSION → no-op (re-correr CREATE IF NOT EXISTS sería
 *      seguro pero inútil cada boot).
 *      Si < SCHEMA_VERSION → en el futuro habrá `applyMigrations(from, to)`;
 *      por ahora throws (defensa contra deploys raros).
 *
 * IMPORTANTE: este bootstrap solo crea las tablas parent (con PARTITION BY).
 * La creación de las particiones diarias y el maintenance corre aparte vía
 * `partitions/register.ts` que llama `partman.create_parent(...)`.
 */
export async function runBootstrap(raw: Sql, logger: BootstrapLogger): Promise<void> {
  await raw.unsafe(ENSURE_PGCRYPTO_SQL);
  logger.info('pgcrypto extension ensured');

  await raw.unsafe(CREATE_SCHEMA_SQL);
  logger.info('schema observability ensured');

  await raw.unsafe(CREATE_SCHEMA_VERSION_SQL);

  const current = await readVersion(raw);

  if (current === null) {
    logger.info(`first install — applying schema v${SCHEMA_VERSION}`);
    await applyV1(raw, logger);
    await writeVersion(raw, SCHEMA_VERSION);
    logger.info(`schema v${SCHEMA_VERSION} applied`);
    return;
  }

  if (current === SCHEMA_VERSION) {
    logger.info(`schema already at v${current}, no migration needed`);
    return;
  }

  if (current < SCHEMA_VERSION) {
    // Cuando se agregue v2+, este branch invoca `applyMigrations(current, SCHEMA_VERSION)`.
    // Mientras solo exista v1, este path es inalcanzable — el throw es defensa
    // contra un downgrade del plugin con upgrade previo de schema.
    throw new Error(
      `[kit-observability] schema_version ${current} < plugin SCHEMA_VERSION ${SCHEMA_VERSION}, ` +
        `but no migrations are registered yet. Add a migration in bootstrap/migrations/ and bump SCHEMA_VERSION.`
    );
  }

  // current > SCHEMA_VERSION — plugin downgradeado. No tocamos nada.
  logger.info(
    `schema at v${current} but plugin expects v${SCHEMA_VERSION}; assuming forward-compatible, skipping bootstrap`
  );
}

async function applyV1(raw: Sql, logger: BootstrapLogger): Promise<void> {
  const tables: { name: string; createSql: string; indexesSql: readonly string[] }[] = [
    { name: 'log_entries', createSql: CREATE_LOG_ENTRIES_SQL, indexesSql: CREATE_LOG_ENTRIES_INDEXES_SQL },
    { name: 'log_spans', createSql: CREATE_LOG_SPANS_SQL, indexesSql: CREATE_LOG_SPANS_INDEXES_SQL },
    { name: 'log_issues', createSql: CREATE_LOG_ISSUES_SQL, indexesSql: CREATE_LOG_ISSUES_INDEXES_SQL },
  ];

  for (const { name, createSql, indexesSql } of tables) {
    await raw.unsafe(createSql);
    for (const stmt of indexesSql) {
      await raw.unsafe(stmt);
    }
    logger.info(`table ${name} created`);
  }
}
