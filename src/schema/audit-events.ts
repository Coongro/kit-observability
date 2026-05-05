import { index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { observabilitySchema } from './observability-schema.js';

export const AUDIT_EVENTS_TABLE = 'audit_events';

/**
 * Tabla de auditoría de acciones sobre el sistema de observability.
 * No particiona — el volumen esperado es órdenes de magnitud menor que
 * log_entries/log_spans, y la ventana útil de audit es ~90 días (rotada
 * por el retention cron si se configura OBSERVABILITY_RETENTION_DAYS_AUDIT).
 */
export const auditEvents = observabilitySchema.table(
  AUDIT_EVENTS_TABLE,
  {
    id: uuid('id').defaultRandom().primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    tenantId: uuid('tenant_id'),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    metadata: jsonb('metadata'),
  },
  (t) => [
    index('idx_audit_events_ts').on(t.timestamp),
    index('idx_audit_events_tenant_ts').on(t.tenantId, t.timestamp),
  ]
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
