import type { SystemDatabase } from '@coongro/database-core';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import {
  AUDIT_EVENTS_TABLE,
  OBSERVABILITY_SCHEMA_NAME,
  auditEvents,
  type AuditEventRow,
} from '../schema/index.js';

export interface AuditEventInput {
  action: string;
  tenantId?: string | null;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventQuery {
  tenantId?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Logger mínimo para reportar fallos de audit sin acoplar al facade completo. */
export interface AuditLogger {
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Registra y consulta eventos de auditoría.
 *
 * `record()` es fire-and-forget para el caller: nunca bloquea ni lanza la
 * operación principal. PERO no es 100% silencioso — los errores se ruteán al
 * `logger.error` inyectado, así un audit table caído deja huella en el log
 * operacional (que va al DBSink y a stdout). Sin esto, una semana entera de
 * audit roto pasaría desapercibida.
 *
 * `query()` es async normal y puede lanzar.
 */
export class AuditLog {
  constructor(
    private readonly db: SystemDatabase,
    private readonly logger: AuditLogger
  ) {}

  record(entry: AuditEventInput): void {
    // Raw SQL en lugar de Drizzle insert: drizzle-orm 0.38.x tiene un bug con
    // `pgSchema().table()` donde las columnas nullable no aparecen en
    // `$inferInsert`, dejando el INSERT type-incompatible (memoria
    // `drizzle_pgschema_insert_type_bug.md`). `query()` abajo sí usa Drizzle
    // porque el bug solo afecta inserts.
    this.db.raw
      .unsafe(
        `INSERT INTO "${OBSERVABILITY_SCHEMA_NAME}"."${AUDIT_EVENTS_TABLE}"
         (tenant_id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
        [
          entry.tenantId ?? null,
          entry.actorId ?? null,
          entry.action,
          entry.entityType ?? null,
          entry.entityId ?? null,
          entry.metadata !== undefined && entry.metadata !== null
            ? JSON.stringify(entry.metadata)
            : null,
        ]
      )
      .catch((err: unknown) => {
        this.logger.error('audit.record_failed', {
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          err: err instanceof Error ? { message: err.message, name: err.name } : String(err),
        });
      });
  }

  async query(filters: AuditEventQuery = {}): Promise<AuditEventRow[]> {
    const conditions: SQL[] = [];

    if (filters.tenantId !== undefined) {
      conditions.push(eq(auditEvents.tenantId, filters.tenantId));
    }
    if (filters.actorId !== undefined) {
      conditions.push(eq(auditEvents.actorId, filters.actorId));
    }
    if (filters.action !== undefined) {
      conditions.push(eq(auditEvents.action, filters.action));
    }
    if (filters.entityType !== undefined) {
      conditions.push(eq(auditEvents.entityType, filters.entityType));
    }
    if (filters.entityId !== undefined) {
      conditions.push(eq(auditEvents.entityId, filters.entityId));
    }
    if (filters.from !== undefined) {
      conditions.push(gte(auditEvents.timestamp, filters.from));
    }
    if (filters.to !== undefined) {
      conditions.push(lte(auditEvents.timestamp, filters.to));
    }

    const limit = Math.max(1, Math.min(filters.limit ?? 100, 1000));

    return this.db.ormQuery((tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditEvents.timestamp))
        .limit(limit)
    );
  }
}
