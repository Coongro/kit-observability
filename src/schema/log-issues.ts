import { bigint, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { observabilitySchema } from './observability-schema.js';

export const LOG_ISSUES_TABLE = 'log_issues';

export const ISSUE_STATUS = {
  open: 'open',
  resolved: 'resolved',
  muted: 'muted',
} as const;

export type IssueStatus = (typeof ISSUE_STATUS)[keyof typeof ISSUE_STATUS];

/**
 * Agregador estilo Sentry por fingerprint. NO particionada (volumen bajo,
 * row-per-fingerprint). El aggregator hace UPSERT atómico vía
 * `INSERT ... ON CONFLICT (fingerprint) DO UPDATE`.
 *
 * `tenant_id` es nullable porque algunos errores son del API global (sin tenant
 * scope, ej: auth fallido). Cuando hay tenant, queda registrado para filtrar.
 */
export const logIssues = observabilitySchema.table(
  LOG_ISSUES_TABLE,
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fingerprint: text('fingerprint').notNull().unique(),
    tenantId: uuid('tenant_id'),
    level: integer('level').notNull(),
    source: text('source').notNull(),
    sampleMessage: text('sample_message').notNull(),
    sampleTopFrame: text('sample_top_frame'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    occurrenceCount: bigint('occurrence_count', { mode: 'bigint' }).notNull().default(0n),
    status: text('status').notNull().default(ISSUE_STATUS.open),
  },
  (t) => [
    index('idx_log_issues_last_seen').on(t.lastSeenAt),
    index('idx_log_issues_tenant_last_seen').on(t.tenantId, t.lastSeenAt),
    index('idx_log_issues_status_last_seen').on(t.status, t.lastSeenAt),
  ]
);

export type LogIssueRow = typeof logIssues.$inferSelect;
export type NewLogIssueRow = typeof logIssues.$inferInsert;
