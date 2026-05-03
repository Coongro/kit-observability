import { LogLevel, type LogEntry } from '@coongro/core-logging';
import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { loadConfig } from '../config.js';
import { registerPartitions } from '../partitions/register.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  getTestDbUrl,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';

import { DBSink } from './db-sink.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

const ENTRIES = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ENTRIES_TABLE}"`;
const ISSUES = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ISSUES_TABLE}"`;

// Filtro por source para aislar las assertions del tráfico real del API en
// dev (cuando el plugin está instalado el API también escribe a la misma
// tabla concurrentemente). Todos los makeEntry() usan name='test-app'.
const TEST_SOURCE = 'test-app';
const ENTRIES_FILTER = `WHERE source = '${TEST_SOURCE}'`;
const ISSUES_FILTER = `WHERE source = '${TEST_SOURCE}'`;

interface EntryRow {
  message: string;
  level: number;
  tenant_id: string | null;
  request_id: string | null;
  source: string;
  fingerprint: string;
}

interface IssueRow {
  fingerprint: string;
  occurrence_count: string; // bigint serializado como string
  sample_message: string;
}

const baseConfig = loadConfig({});

describe.skipIf(skipIfNoDb)('DBSink end-to-end (integration — Milestone 2 acceptance)', () => {
  let sql: Sql;
  let sink: DBSink;

  beforeAll(() => {
    sql = createTestSql();
  });

  afterAll(async () => {
    await sink?.close();
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    if (sink) await sink.close();
    await resetObservabilitySchema(sql);
    await runBootstrap(sql, silentLogger);
    await registerPartitions(sql, baseConfig, silentLogger);
    sink = new DBSink(
      { raw: sql },
      {
        batchSize: baseConfig.batchSize,
        batchIntervalMs: baseConfig.batchIntervalMs,
        failsafe: null,
      }
    );
  });

  it('Acceptance #1: logger.info() vía sink → fila en log_entries con todos los campos', async () => {
    sink.write(makeEntry({ level: LogLevel.INFO, message: 'test message' }));
    await sink.flushNow();

    const rows = await sql.unsafe<EntryRow[]>(`SELECT * FROM ${ENTRIES} ${ENTRIES_FILTER}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe('test message');
    expect(rows[0]?.level).toBe(LogLevel.INFO);
    expect(rows[0]?.source).toBe('test-app');
    expect(rows[0]?.tenant_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(rows[0]?.request_id).toBe('req-abc');
    expect(rows[0]?.fingerprint).toMatch(/^[0-9a-f]{40}$/);
  });

  it('Acceptance #2: logger.error() dispara flush sync (no espera intervalo)', async () => {
    // Sink configurado con batchIntervalMs altísimo — si no fuera flush sync,
    // la fila no aparecería al consultar inmediatamente.
    const fastSync = new DBSink(
      { raw: sql },
      { batchSize: 1000, batchIntervalMs: 99999, failsafe: null }
    );
    fastSync.write(makeEntry({ level: LogLevel.ERROR, message: 'boom' }));
    // NO llamamos flushNow(); confiamos en shouldFlushSync
    await waitFor(async () => {
      const rows = await sql.unsafe<EntryRow[]>(`SELECT message FROM ${ENTRIES} ${ENTRIES_FILTER}`);
      return rows.length === 1 && rows[0]?.message === 'boom';
    }, 1000);
    await fastSync.close();
  });

  it('Acceptance #3: warn repetido con mismo fingerprint → N filas en log_entries + 1 fila en log_issues con count=N', async () => {
    for (let i = 0; i < 5; i++) {
      sink.write(makeEntry({ level: LogLevel.WARN, message: 'something failed' }));
    }
    await sink.flushNow();

    const entries = await sql.unsafe<EntryRow[]>(`SELECT * FROM ${ENTRIES} ${ENTRIES_FILTER}`);
    expect(entries).toHaveLength(5);
    // todas con mismo fingerprint
    const fps = new Set(entries.map((e) => e.fingerprint));
    expect(fps.size).toBe(1);

    const issues = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES} ${ISSUES_FILTER}`);
    expect(issues).toHaveLength(1);
    expect(BigInt(issues[0]?.occurrence_count ?? '0')).toBe(5n);
    expect(issues[0]?.sample_message).toBe('something failed');
  });

  it('warns con mensajes que normalizan al mismo fingerprint colapsan al mismo issue', async () => {
    sink.write(
      makeEntry({
        level: LogLevel.WARN,
        message: 'tenant aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee not found',
      })
    );
    sink.write(
      makeEntry({
        level: LogLevel.WARN,
        message: 'tenant 11111111-2222-3333-4444-555555555555 not found',
      })
    );
    sink.write(
      makeEntry({
        level: LogLevel.WARN,
        message: 'tenant 99999999-8888-7777-6666-aaaaaaaaaaaa not found',
      })
    );
    await sink.flushNow();

    const entries = await sql.unsafe<EntryRow[]>(`SELECT fingerprint FROM ${ENTRIES} ${ENTRIES_FILTER}`);
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.fingerprint)).size).toBe(1);

    const issues = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES} ${ISSUES_FILTER}`);
    expect(issues).toHaveLength(1);
    expect(BigInt(issues[0]?.occurrence_count ?? '0')).toBe(3n);
  });

  it('entries con level < WARN no van al aggregator (solo log_entries)', async () => {
    sink.write(makeEntry({ level: LogLevel.INFO, message: 'just info' }));
    sink.write(makeEntry({ level: LogLevel.DEBUG, message: 'just debug' }));
    await sink.flushNow();

    const entries = await sql.unsafe<EntryRow[]>(`SELECT * FROM ${ENTRIES} ${ENTRIES_FILTER}`);
    expect(entries).toHaveLength(2);

    const issues = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES} ${ISSUES_FILTER}`);
    expect(issues).toHaveLength(0);
  });
});

function makeEntry(overrides: Partial<LogEntry> & { level: LogLevel; message: string }): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    name: 'test-app',
    context: {
      tenantId: '11111111-2222-3333-4444-555555555555',
      requestId: 'req-abc',
    },
    ...overrides,
  };
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}
