import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  getTestDbUrl,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';

import { recordIssues, preAggregate } from './aggregator.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

const ISSUES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ISSUES_TABLE}"`;

interface IssueRow {
  fingerprint: string;
  // postgres.js retorna columnas bigint como string para evitar pérdida de precisión.
  // Los tests convierten con BigInt() antes de comparar.
  occurrence_count: string;
  sample_message: string;
  sample_top_frame: string | null;
  level: number;
}

describe.skipIf(skipIfNoDb)('recordIssues + preAggregate (integration)', () => {
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

  it('inserta una fila nueva al primer recordIssues', async () => {
    await recordIssues(sql, [
      {
        fingerprint: 'fp-1',
        count: 1,
        level: 40,
        source: 'app',
        sampleMessage: 'first error',
        sampleTopFrame: null,
        tenantId: null,
      },
    ]);
    const rows = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES_TABLE}`);
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]?.occurrence_count ?? '0')).toBe(1n);
    expect(rows[0]?.sample_message).toBe('first error');
  });

  it('UPSERT atómico: misma fingerprint suma occurrence_count en vez de duplicar fila', async () => {
    await recordIssues(sql, [
      {
        fingerprint: 'fp-x',
        count: 1,
        level: 40,
        source: 's',
        sampleMessage: 'm1',
        sampleTopFrame: null,
        tenantId: null,
      },
    ]);
    await recordIssues(sql, [
      {
        fingerprint: 'fp-x',
        count: 5,
        level: 40,
        source: 's',
        sampleMessage: 'm2',
        sampleTopFrame: null,
        tenantId: null,
      },
    ]);
    await recordIssues(sql, [
      {
        fingerprint: 'fp-x',
        count: 2,
        level: 40,
        source: 's',
        sampleMessage: 'm3',
        sampleTopFrame: 'frame-A',
        tenantId: null,
      },
    ]);
    const rows = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES_TABLE}`);
    expect(rows).toHaveLength(1);
    expect(BigInt(rows[0]?.occurrence_count ?? '0')).toBe(8n);
    // sample debe reflejar el más reciente
    expect(rows[0]?.sample_message).toBe('m3');
    expect(rows[0]?.sample_top_frame).toBe('frame-A');
  });

  it('preAggregate + recordIssues: 5 entries con 2 fingerprints distintos → 2 filas con counts correctos', async () => {
    const aggregated = preAggregate([
      {
        fingerprint: 'a',
        level: 40,
        source: 's',
        sampleMessage: 'msg',
        sampleTopFrame: null,
        tenantId: null,
      },
      {
        fingerprint: 'b',
        level: 40,
        source: 's',
        sampleMessage: 'msg',
        sampleTopFrame: null,
        tenantId: null,
      },
      {
        fingerprint: 'a',
        level: 40,
        source: 's',
        sampleMessage: 'msg',
        sampleTopFrame: null,
        tenantId: null,
      },
      {
        fingerprint: 'a',
        level: 40,
        source: 's',
        sampleMessage: 'msg',
        sampleTopFrame: null,
        tenantId: null,
      },
      {
        fingerprint: 'b',
        level: 40,
        source: 's',
        sampleMessage: 'msg',
        sampleTopFrame: null,
        tenantId: null,
      },
    ]);
    await recordIssues(sql, aggregated);
    const rows = await sql.unsafe<IssueRow[]>(
      `SELECT fingerprint, occurrence_count FROM ${ISSUES_TABLE} ORDER BY fingerprint`
    );
    expect(rows).toHaveLength(2);
    expect(BigInt(rows[0]?.occurrence_count ?? '0')).toBe(3n); // a
    expect(BigInt(rows[1]?.occurrence_count ?? '0')).toBe(2n); // b
  });

  it('recordIssues con array vacío es no-op', async () => {
    await expect(recordIssues(sql, [])).resolves.not.toThrow();
    const rows = await sql.unsafe<IssueRow[]>(`SELECT * FROM ${ISSUES_TABLE}`);
    expect(rows).toHaveLength(0);
  });
});
