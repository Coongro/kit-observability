import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditLog } from '../audit/index.js';
import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { clearRuntimeState, setRuntimeState } from '../runtime/state.js';
import { AUDIT_EVENTS_TABLE } from '../schema/audit-events.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  createTestSystemDatabase,
  getTestDbUrl,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';

import { queryAuditEndpoint } from './audit-query.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

const TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${AUDIT_EVENTS_TABLE}"`;

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ACTOR_ID = '33333333-3333-3333-3333-333333333333';

const drain = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 100));

const makeContext = (
  query: Record<string, string | undefined>
): Parameters<typeof queryAuditEndpoint>[0] =>
  ({ query }) as unknown as Parameters<typeof queryAuditEndpoint>[0];

interface AuditEventRowLike {
  id: string;
  action: string;
  tenantId: string | null;
}

interface AuditQueryResponse {
  rows: AuditEventRowLike[];
}

const isAuditQueryResponse = (value: unknown): value is AuditQueryResponse =>
  typeof value === 'object' && value !== null && Array.isArray((value as AuditQueryResponse).rows);

describe.skipIf(skipIfNoDb)('queryAuditEndpoint (integration)', () => {
  let sql: Sql;
  let audit: AuditLog;

  beforeAll(async () => {
    sql = createTestSql();
    const systemDb = createTestSystemDatabase(sql);
    audit = new AuditLog(systemDb);
    await resetObservabilitySchema(sql);
    await runBootstrap(sql, silentLogger);

    setRuntimeState({
      systemDb,
      auditLog: audit,
    } as never);
  });

  afterAll(async () => {
    clearRuntimeState();
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE ${TABLE}`);
    audit.record({
      action: 'user.login',
      tenantId: TENANT_A,
      actorId: ACTOR_ID,
    });
    audit.record({
      action: 'permission.grant',
      tenantId: TENANT_A,
      actorId: ACTOR_ID,
      entityType: 'role',
      entityId: 'admin',
    });
    audit.record({
      action: 'user.login',
      tenantId: TENANT_B,
    });
    await drain();
  });

  it('sin filtros devuelve los eventos persistidos', async () => {
    const result = await queryAuditEndpoint(makeContext({}));
    expect(isAuditQueryResponse(result)).toBe(true);
    if (!isAuditQueryResponse(result)) return;
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('filtra por tenant_id', async () => {
    const result = await queryAuditEndpoint(makeContext({ tenant_id: TENANT_A }));
    if (!isAuditQueryResponse(result)) throw new Error('bad shape');
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    for (const row of result.rows) {
      expect(row.tenantId).toBe(TENANT_A);
    }
  });

  it('combina tenant_id + action', async () => {
    const result = await queryAuditEndpoint(
      makeContext({ tenant_id: TENANT_A, action: 'user.login' })
    );
    if (!isAuditQueryResponse(result)) throw new Error('bad shape');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.tenantId).toBe(TENANT_A);
    expect(result.rows[0]?.action).toBe('user.login');
  });

  it('limit recorta el resultado', async () => {
    const result = await queryAuditEndpoint(makeContext({ limit: '1' }));
    if (!isAuditQueryResponse(result)) throw new Error('bad shape');
    expect(result.rows).toHaveLength(1);
  });

  it('rango de fechas en el futuro devuelve vacío', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = await queryAuditEndpoint(makeContext({ from: future }));
    if (!isAuditQueryResponse(result)) throw new Error('bad shape');
    expect(result.rows).toHaveLength(0);
  });
});
