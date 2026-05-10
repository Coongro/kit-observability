import type { Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AUDIT_EVENTS_TABLE } from '../schema/audit-events.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import {
  createTestSql,
  createTestSystemDatabase,
  getTestDbUrl,
  resetObservabilitySchema,
  setupObservabilitySchema,
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
    audit = new AuditLog(createTestSystemDatabase(sql), silentLogger);
    await resetObservabilitySchema(sql);
    await setupObservabilitySchema(sql);
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

    it('no lanza aunque el INSERT falle, pero loggea via logger.error', async () => {
      const failure = new Error('simulated DB failure');
      const brokenDb = {
        raw: { unsafe: () => Promise.reject(failure) },
      };
      const errors: { msg: string; error?: unknown; meta?: Record<string, unknown> }[] = [];
      const captureLogger = {
        error: (msg: string, error?: unknown, meta?: Record<string, unknown>) => {
          errors.push({ msg, error, meta });
        },
      };
      const badAudit = new AuditLog(brokenDb as never, captureLogger);
      expect(() => badAudit.record({ action: 'should.fail' })).not.toThrow();
      // Esperar al microtask del catch.
      await new Promise<void>((r) => setTimeout(r, 10));
      expect(errors).toHaveLength(1);
      expect(errors[0]?.msg).toBe('audit.record_failed');
      // El Error real va como 2do arg (no aplastado dentro de meta) — esto
      // es lo que permite al bridge pino del host serializarlo con stack.
      expect(errors[0]?.error).toBe(failure);
      expect(errors[0]?.meta).toMatchObject({ action: 'should.fail' });
    });

    it('coerce actorId no-UUID a NULL y preserva el original en metadata.actorIdRaw', async () => {
      audit.record({
        action: 'user.login',
        tenantId: TENANT_A,
        actorId: 42,
      });
      await drain();

      const rows = await sql.unsafe<
        { actor_id: string | null; metadata: Record<string, unknown> | null }[]
      >(`SELECT actor_id, metadata FROM ${TABLE}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actor_id).toBeNull();
      expect(rows[0]?.metadata).toEqual({ actorIdRaw: '42' });
    });

    it('actorId UUID válido va a actor_id sin tocar metadata', async () => {
      audit.record({
        action: 'user.login',
        tenantId: TENANT_A,
        actorId: ACTOR_ID,
        metadata: { source: 'cli' },
      });
      await drain();

      const rows = await sql.unsafe<
        { actor_id: string | null; metadata: Record<string, unknown> | null }[]
      >(`SELECT actor_id, metadata FROM ${TABLE}`);
      expect(rows[0]?.actor_id).toBe(ACTOR_ID);
      expect(rows[0]?.metadata).toEqual({ source: 'cli' });
    });

    it('tenantId no-UUID también se coerce a NULL sin reventar el INSERT', async () => {
      audit.record({
        action: 'system.something',
        tenantId: 'not-a-uuid',
      });
      await drain();

      const rows = await sql.unsafe<{ tenant_id: string | null }[]>(
        `SELECT tenant_id FROM ${TABLE}`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenant_id).toBeNull();
    });

    it('persiste requestId en la columna request_id', async () => {
      audit.record({
        action: 'plugin.installed',
        tenantId: TENANT_A,
        actorId: ACTOR_ID,
        requestId: 'req-abc-123',
      });
      await drain();

      const rows = await sql.unsafe<{ request_id: string | null }[]>(
        `SELECT request_id FROM ${TABLE}`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.request_id).toBe('req-abc-123');
    });

    it('requestId omitido se persiste como NULL (cron, boot, etc.)', async () => {
      audit.record({ action: 'cron.tick' });
      await drain();

      const rows = await sql.unsafe<{ request_id: string | null }[]>(
        `SELECT request_id FROM ${TABLE}`
      );
      expect(rows[0]?.request_id).toBeNull();
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
      audit.record({
        action: 'user.login',
        tenantId: TENANT_A,
        actorId: ACTOR_ID,
        requestId: 'req-login-1',
      });
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

    it('filtra por requestId para reconstruir un request específico', async () => {
      const rows = await audit.query({ requestId: 'req-login-1' });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.requestId).toBe('req-login-1');
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
