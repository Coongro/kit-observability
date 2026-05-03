import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import {
  createTestSql,
  getTestDbUrl,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { LOG_SPANS_TABLE } from '../schema/log-spans.js';
import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';
import { runBootstrap } from './run-bootstrap.js';
import { SCHEMA_VERSION, SCHEMA_VERSION_TABLE, readVersion } from './schema-version.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

describe.skipIf(skipIfNoDb)('runBootstrap (integration)', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = createTestSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await resetObservabilitySchema(sql);
  });

  it('crea schema + 3 tablas + version row al primer bootstrap', async () => {
    await runBootstrap(sql, silentLogger);

    const schemas = await sql.unsafe<{ nspname: string }[]>(
      `SELECT nspname FROM pg_namespace WHERE nspname = $1`,
      [OBSERVABILITY_SCHEMA_NAME]
    );
    expect(schemas).toHaveLength(1);

    const tables = await sql.unsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
      [OBSERVABILITY_SCHEMA_NAME]
    );
    const tableNames = tables.map((t) => t.tablename);
    expect(tableNames).toContain(LOG_ENTRIES_TABLE);
    expect(tableNames).toContain(LOG_SPANS_TABLE);
    expect(tableNames).toContain(LOG_ISSUES_TABLE);
    expect(tableNames).toContain(SCHEMA_VERSION_TABLE);

    expect(await readVersion(sql)).toBe(SCHEMA_VERSION);
  });

  it('crea los índices declarados en cada tabla', async () => {
    await runBootstrap(sql, silentLogger);

    const indexes = await sql.unsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
      [OBSERVABILITY_SCHEMA_NAME]
    );
    const idxNames = new Set(indexes.map((i) => i.indexname));
    expect(idxNames).toContain('idx_log_entries_ts_level_source');
    expect(idxNames).toContain('idx_log_entries_tenant_ts');
    expect(idxNames).toContain('idx_log_entries_fingerprint_ts');
    expect(idxNames).toContain('idx_log_spans_trace_start');
    expect(idxNames).toContain('idx_log_spans_tenant_start');
    expect(idxNames).toContain('idx_log_spans_service_start');
    expect(idxNames).toContain('idx_log_issues_last_seen');
    expect(idxNames).toContain('idx_log_issues_tenant_last_seen');
    expect(idxNames).toContain('idx_log_issues_status_last_seen');
  });

  it('declara log_entries y log_spans como PARTITION BY RANGE', async () => {
    await runBootstrap(sql, silentLogger);

    const rows = await sql.unsafe<{ relname: string; partstrat: string }[]>(
      `SELECT c.relname, pt.partstrat::text
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_partitioned_table pt ON pt.partrelid = c.oid
        WHERE n.nspname = $1`,
      [OBSERVABILITY_SCHEMA_NAME]
    );
    const byTable = new Map(rows.map((r) => [r.relname, r.partstrat]));
    expect(byTable.get(LOG_ENTRIES_TABLE)).toBe('r'); // 'r' = RANGE
    expect(byTable.get(LOG_SPANS_TABLE)).toBe('r');
    // log_issues NO debe estar particionada
    expect(byTable.has(LOG_ISSUES_TABLE)).toBe(false);
  });

  it('es idempotente: 2 ejecuciones consecutivas no rompen nada', async () => {
    await runBootstrap(sql, silentLogger);
    const v1 = await readVersion(sql);
    await expect(runBootstrap(sql, silentLogger)).resolves.not.toThrow();
    const v2 = await readVersion(sql);
    expect(v1).toBe(v2);
    expect(v2).toBe(SCHEMA_VERSION);
  });

  it('schema_version es singleton (CHECK id = 1 fuerza una sola fila)', async () => {
    await runBootstrap(sql, silentLogger);
    await expect(
      sql.unsafe(
        `INSERT INTO "${OBSERVABILITY_SCHEMA_NAME}"."${SCHEMA_VERSION_TABLE}" (id, version) VALUES (2, 99)`
      )
    ).rejects.toThrow();
  });
});
