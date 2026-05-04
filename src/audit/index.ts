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

/**
 * Registra y consulta eventos de auditoría.
 *
 * `record()` es fire-and-forget: los errores se capturan silenciosamente
 * para que un fallo de auditoría nunca bloquee la operación principal.
 * `query()` es async y puede lanzar.
 */
export class AuditLog {
  constructor(private readonly db: SystemDatabase) {}

  record(entry: AuditEventInput): void {
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
      .catch(() => undefined);
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
