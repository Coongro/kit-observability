import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../runtime/state.js', () => ({
  getRuntimeState: vi.fn(),
}));

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { loadConfig } from '../config.js';
import { registerPartitions } from '../partitions/register.js';
import { getRuntimeState } from '../runtime/state.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { LOG_SPANS_TABLE } from '../schema/log-spans.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  getTestDbUrl,
  listChildPartitions,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';

import { runMaintenance } from './maintenance.js';
import { runRetention } from './retention.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

const S = OBSERVABILITY_SCHEMA_NAME;
const ENTRIES = `"${S}"."${LOG_ENTRIES_TABLE}"`;
const SPANS = `"${S}"."${LOG_SPANS_TABLE}"`;

/**
 * Monta el estado de runtime que los handlers leen via getRuntimeState().
 * Solo se usan systemDb.raw + config — el resto del RuntimeState no se toca.
 */
function mockState(sql: Sql, envOverrides: Record<string, string> = {}) {
  const config = loadConfig(envOverrides);
  vi.mocked(getRuntimeState).mockReturnValue({
    systemDb: { raw: sql },
    config,
  } as unknown as ReturnType<typeof getRuntimeState>);
  return config;
}

/**
 * Crea una partición hija manual ANTES de que pg_partman corra, para cubrir
 * un rango histórico donde pg_partman no crea particiones automáticamente.
 * Se usa 7 días hacia atrás para asegurarse de estar fuera del rango backward
 * que pg_partman crea (típicamente 1-2 días hacia atrás).
 */
async function createPastPartition(sql: Sql, table: string, daysAgo: number): Promise<void> {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysAgo);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  await sql.unsafe(
    `CREATE TABLE IF NOT EXISTS "${S}"."${table}_past_${daysAgo}d"` +
      ` PARTITION OF "${S}"."${table}"` +
      ` FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`
  );
}

/** Timestamp UTC al mediodía, N días hacia atrás. */
function daysAgoTs(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

/**
 * Devuelve 'YYYYMMDD' de hoy en hora local. pg_partman nombra particiones con
 * la fecha local del inicio del rango, por lo que este valor sirve para
 * distinguir particiones actuales/pasadas de las futuras.
 */
function localDateKey(): string {
  const d = new Date();
  return [
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
}

/**
 * Filtra particiones cuyo sufijo `pYYYYMMDD` sea estrictamente mayor a la
 * fecha dada — equivale a "particiones que cubren un rango que arranca en
 * el futuro".
 */
function partitionsAfter(names: string[], dateKey: string): string[] {
  return names.filter((p) => {
    const match = /p(\d{8})$/.exec(p);
    return match?.[1] !== undefined && match[1] > dateKey;
  });
}

// ─── retention cron ────────────────────────────────────────────────────────────

describe.skipIf(skipIfNoDb)('runRetention (integration — COONG-145 acceptance)', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = createTestSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await resetObservabilitySchema(sql);
    await runBootstrap(sql, silentLogger);
    // Las particiones del pasado se crean ANTES de registerPartitions para evitar
    // solapamiento con las particiones backward que pg_partman crea automáticamente
    // (típicamente 1-2 días atrás). Ir 7 días atrás garantiza rango disjunto.
    await createPastPartition(sql, LOG_ENTRIES_TABLE, 7);
    await createPastPartition(sql, LOG_SPANS_TABLE, 7);
  });

  it('borra filas debug/info más viejas que retentionDaysDebug, conserva recientes', async () => {
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_DEBUG: '5' });
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 10, 'test', 'old debug')`,
      [daysAgoTs(7)]
    );
    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES (NOW(), 10, 'test', 'new debug')`
    );

    await runRetention({ logger: silentLogger });

    const rows = await sql.unsafe<{ message: string }[]>(
      `SELECT message FROM ${ENTRIES} WHERE source = 'test'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('new debug');
  });

  it('borra filas warn más viejas que retentionDaysWarn, conserva recientes', async () => {
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_WARN: '5' });
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 30, 'test', 'old warn')`,
      [daysAgoTs(7)]
    );
    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES (NOW(), 30, 'test', 'new warn')`
    );

    await runRetention({ logger: silentLogger });

    const rows = await sql.unsafe<{ message: string }[]>(
      `SELECT message FROM ${ENTRIES} WHERE source = 'test'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('new warn');
  });

  it('borra filas error/fatal más viejas que retentionDaysError, conserva recientes', async () => {
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_ERROR: '5' });
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 50, 'test', 'old error')`,
      [daysAgoTs(7)]
    );
    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES (NOW(), 50, 'test', 'new error')`
    );

    await runRetention({ logger: silentLogger });

    const rows = await sql.unsafe<{ message: string }[]>(
      `SELECT message FROM ${ENTRIES} WHERE source = 'test'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('new error');
  });

  it('no borra filas de niveles fuera del bucket configurado', async () => {
    // Solo debug configurado → warn viejo NO se toca
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_DEBUG: '5' });
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 10, 'test', 'old debug')`,
      [daysAgoTs(7)]
    );
    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 30, 'test', 'old warn')`,
      [daysAgoTs(7)]
    );

    await runRetention({ logger: silentLogger });

    const rows = await sql.unsafe<{ message: string }[]>(
      `SELECT message FROM ${ENTRIES} WHERE source = 'test'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('old warn');
  });

  it('no borra nada cuando todas las retentionDays son null (modo sin retención)', async () => {
    const config = mockState(sql, {}); // null por defecto
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${ENTRIES} (timestamp, level, source, message) VALUES ($1, 10, 'test', 'old row')`,
      [daysAgoTs(7)]
    );

    await runRetention({ logger: silentLogger });

    const rows = await sql.unsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM ${ENTRIES} WHERE source = 'test'`
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('borra spans más viejos que retentionDaysSpans, conserva recientes', async () => {
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_SPANS: '5' });
    await registerPartitions(sql, config, silentLogger);

    await sql.unsafe(
      `INSERT INTO ${SPANS} (span_id, trace_id, name, start_time) VALUES ('old-span', 'trace-1', 'http.get', $1)`,
      [daysAgoTs(7)]
    );
    await sql.unsafe(
      `INSERT INTO ${SPANS} (span_id, trace_id, name, start_time) VALUES ('new-span', 'trace-1', 'http.get', NOW())`
    );

    await runRetention({ logger: silentLogger });

    // Filtrar por span_id del test para aislar de spans que el API pueda
    // insertar concurrentemente en la misma dev DB durante la ejecución del test.
    const oldSpan = await sql.unsafe(`SELECT 1 FROM ${SPANS} WHERE span_id = 'old-span'`);
    expect(oldSpan).toHaveLength(0);
    const newSpan = await sql.unsafe(`SELECT 1 FROM ${SPANS} WHERE span_id = 'new-span'`);
    expect(newSpan).toHaveLength(1);
  });

  it('no escribe filas en log_entries como efecto secundario (no feedback loop)', async () => {
    const config = mockState(sql, { OBSERVABILITY_RETENTION_DAYS_DEBUG: '5' });
    await registerPartitions(sql, config, silentLogger);

    // Snapshot de IDs ANTES de runRetention. Mismo patrón que el test de spans
    // (línea ~240) que filtra por span_id para aislarse de actividad concurrente:
    // contra la dev DB local, una instancia activa de la API puede tener su
    // DBSink escribiendo a log_entries en paralelo. Lo único que importa para
    // este test es que `runRetention` no AGREGUE filas — un feedback loop
    // hipotético produciría filas con IDs no presentes en este snapshot.
    const beforeIds = new Set(
      (await sql.unsafe<{ id: string }[]>(`SELECT id::text AS id FROM ${ENTRIES}`)).map((r) => r.id)
    );

    await runRetention({ logger: silentLogger });

    const after = await sql.unsafe<{ id: string }[]>(`SELECT id::text AS id FROM ${ENTRIES}`);
    const newIds = after.filter((r) => !beforeIds.has(r.id));
    expect(newIds).toHaveLength(0);
  });
});

// ─── maintenance cron ──────────────────────────────────────────────────────────

describe.skipIf(skipIfNoDb)('runMaintenance (integration — COONG-145 acceptance)', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = createTestSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await resetObservabilitySchema(sql);
    await runBootstrap(sql, silentLogger);
  });

  it('garantiza ≥7 particiones futuras en log_entries tras registration + maintenance con premake=7', async () => {
    const config = mockState(sql, { OBSERVABILITY_PARTITION_PREMAKE: '7' });
    await registerPartitions(sql, config, silentLogger);

    // maintenance asegura que el conteo de futuras se mantenga en ≥ premake
    await runMaintenance({ logger: silentLogger });

    const after = await listChildPartitions(sql, S, LOG_ENTRIES_TABLE);
    const future = partitionsAfter(after, localDateKey());
    expect(future.length).toBeGreaterThanOrEqual(7);
  });

  it('garantiza ≥7 particiones futuras en log_spans tras registration + maintenance con premake=7', async () => {
    const config = mockState(sql, { OBSERVABILITY_PARTITION_PREMAKE: '7' });
    await registerPartitions(sql, config, silentLogger);

    await runMaintenance({ logger: silentLogger });

    const after = await listChildPartitions(sql, S, LOG_SPANS_TABLE);
    const future = partitionsAfter(after, localDateKey());
    expect(future.length).toBeGreaterThanOrEqual(7);
  });

  it('no escribe filas en log_entries como efecto secundario (no feedback loop)', async () => {
    const config = mockState(sql);
    await registerPartitions(sql, config, silentLogger);

    await runMaintenance({ logger: silentLogger });

    const rows = await sql.unsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM ${ENTRIES}`
    );
    expect(rows[0]?.count).toBe('0');
  });
});
