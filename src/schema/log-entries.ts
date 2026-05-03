import { index, integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { observabilitySchema } from './observability-schema.js';

export const LOG_ENTRIES_TABLE = 'log_entries';

/**
 * Tabla de log entries. PARTITION BY RANGE(timestamp) — el DDL real con
 * particionado se emite en activate() via raw SQL.
 *
 * La PK es (id, timestamp) porque PostgreSQL exige que la PK incluya la
 * columna de partición.
 */
export const logEntries = observabilitySchema.table(
  LOG_ENTRIES_TABLE,
  {
    id: uuid('id').defaultRandom().notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true, mode: 'date' }).notNull(),
    tenantId: uuid('tenant_id'),
    requestId: text('request_id'),
    level: integer('level').notNull(),
    source: text('source').notNull(),
    message: text('message').notNull(),
    context: jsonb('context'),
    metadata: jsonb('metadata'),
    error: jsonb('error'),
    callSite: jsonb('call_site'),
    fingerprint: text('fingerprint'),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.timestamp] }),
    index('idx_log_entries_ts_level_source').on(t.timestamp, t.level, t.source),
    index('idx_log_entries_tenant_ts').on(t.tenantId, t.timestamp),
    index('idx_log_entries_fingerprint_ts').on(t.fingerprint, t.timestamp),
  ]
);

export type LogEntryRow = typeof logEntries.$inferSelect;
export type NewLogEntryRow = typeof logEntries.$inferInsert;
