import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { AUDIT_EVENTS_TABLE } from '../schema/audit-events.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  createTestSystemDatabase,
  getTestDbUrl,
  resetObservabilitySchema,
  silentLogger,
} from '../test-utils/db.js';

import { AuditLog } from './index.js';

const dbUrl = getTestDbUrl();
const skipIfNoDb = dbUrl === null;

const TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${AUDIT_EVENTS_TABLE}"`;

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ACTOR_ID = '33333333-3333-3333-3333-333333333333';

/** Drena el event loop para que los INSERTs fire-and-forget lleguen a la DB. */
const drain = () => new Promise<void>((r) => setTimeout(r, 100));

describe.skipIf(skipIfNoDb)('AuditLog (integration)', () => {
  let sql: Sql;
  let audit: AuditLog;

  beforeAll(async () => {
    sql = createTestSql();
    audit = new AuditLog(createTestSystemDatabase(sql));
    await resetObservabilitySchema(sql);
    await runBootstrap(sql, silentLogger);
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE ${TABLE}`);
  });

  describe('record()', () => {
    it('persiste un evento con todos los campos', async () => {
      audit.record({
        action: 'user.login',
        tenantId: TENANT_A,
        actorId: ACTOR_ID,
        entityType: 'user',
        entityId: ACTOR_ID,
        metadata: { ip: '127.0.0.1', userAgent: 'test' },
      });
      await drain();

      const rows = await sql.unsafe<
        {
          action: string;
          tenant_id: string;
          actor_id: string;
          entity_type: string;
          entity_id: string;
          metadata: { ip: string };
        }[]
      >(`SELECT action, tenant_id, actor_id, entity_type, entity_id, metadata FROM ${TABLE}`);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'user.login',
        tenant_id: TENANT_A,
        actor_id: ACTOR_ID,
        entity_type: 'user',
        entity_id: ACTOR_ID,
      });
      expect(rows[0]?.metadata).toMatchObject({ ip: '127.0.0.1' });
    });

    it('persiste un evento con solo action (campos opcionales null)', async () => {
      audit.record({ action: 'system.boot' });
      await drain();

      const rows = await sql.unsafe<
        { action: string; tenant_id: unknown; actor_id: unknown; metadata: unknown }[]
      >(`SELECT action, tenant_id, actor_id, metadata FROM ${TABLE}`);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.action).toBe('system.boot');
      expect(rows[0]?.tenant_id).toBeNull();
      expect(rows[0]?.actor_id).toBeNull();
      expect(rows[0]?.metadata).toBeNull();
    });

    it('no lanza aunque el INSERT falle (fire-and-forget silencioso)', () => {
      // record() usa this.db.raw.unsafe(...) — mockeamos el shape mínimo
      // que satisface esa ruta y rechaza, para verificar el catch silencioso.
      const brokenDb = {
        raw: { unsafe: () => Promise.reject(new Error('simulated DB failure')) },
      };
      const badAudit = new AuditLog(brokenDb as never);
      expect(() => badAudit.record({ action: 'should.fail' })).not.toThrow();
    });

    it('genera id uuid y timestamp automáticamente', async () => {
      audit.record({ action: 'check.defaults' });
      await drain();

      const rows = await sql.unsafe<{ id: string; timestamp: Date }[]>(
        `SELECT id, timestamp FROM ${TABLE}`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(rows[0]?.timestamp).toBeDefined();
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      audit.record({
        action: 'permission.grant',
        tenantId: TENANT_A,
        actorId: ACTOR_ID,
        entityType: 'role',
        entityId: 'admin',
      });
      audit.record({ action: 'user.login', tenantId: TENANT_A, actorId: ACTOR_ID });
      audit.record({ action: 'user.login', tenantId: TENANT_B });
      audit.record({
        action: 'entity.update',
        tenantId: TENANT_A,
        entityType: 'patient',
        entityId: 'p-123',
      });
      await drain();
    });

    it('sin filtros retorna todos los eventos ordenados por timestamp DESC', async () => {
      const rows = await audit.query();
      expect(rows.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const curr = rows[i];
        if (prev !== undefined && curr !== undefined) {
          expect(prev.timestamp >= curr.timestamp).toBe(true);
        }
      }
    });

    it('filtra por tenantId', async () => {
      const rows = await audit.query({ tenantId: TENANT_A });
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const row of rows) {
        expect(row.tenantId).toBe(TENANT_A);
      }
    });

    it('filtra por action', async () => {
      const rows = await audit.query({ action: 'user.login' });
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const row of rows) {
        expect(row.action).toBe('user.login');
      }
    });

    it('filtra por entityType', async () => {
      const rows = await audit.query({ entityType: 'patient' });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]?.entityType).toBe('patient');
    });

    it('combina tenantId + action', async () => {
      const rows = await audit.query({ tenantId: TENANT_A, action: 'user.login' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(TENANT_A);
      expect(rows[0]?.action).toBe('user.login');
    });

    it('respeta el límite', async () => {
      const rows = await audit.query({ limit: 2 });
      expect(rows.length).toBeLessThanOrEqual(2);
    });

    it('filtra por rango de fechas', async () => {
      const future = new Date(Date.now() + 60_000);
      const rows = await audit.query({ to: future });
      expect(rows.length).toBeGreaterThanOrEqual(4);

      const emptyRows = await audit.query({ from: future });
      expect(emptyRows).toHaveLength(0);
    });

    it('retorna campos en camelCase', async () => {
      const rows = await audit.query({ tenantId: TENANT_A, action: 'permission.grant' });
      expect(rows).toHaveLength(1);
      const row = rows[0];
      if (row === undefined) throw new Error('row is undefined');
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('timestamp');
      expect(row).toHaveProperty('tenantId', TENANT_A);
      expect(row).toHaveProperty('actorId', ACTOR_ID);
      expect(row).toHaveProperty('action', 'permission.grant');
      expect(row).toHaveProperty('entityType', 'role');
      expect(row).toHaveProperty('entityId', 'admin');
    });
  });
});
