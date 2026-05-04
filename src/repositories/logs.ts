import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_entries"`;

export interface LogQueryFilters {
  level?: number;
  source?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  q?: string;
  limit: number;
  offset: number;
}

export interface LogEntryRecord {
  id: string;
  timestamp: Date;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  source: string;
  message: string;
  context: unknown;
  metadata: unknown;
  error: unknown;
  fingerprint: string | null;
}

export interface LogQueryResult {
  entries: LogEntryRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function queryLogs(raw: Sql, filters: LogQueryFilters): Promise<LogQueryResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (filters.level !== undefined) {
    conditions.push(`level = $${idx++}`);
    params.push(filters.level);
  }
  if (filters.source) {
    conditions.push(`source = $${idx++}`);
    params.push(filters.source);
  }
  if (filters.tenantId) {
    conditions.push(`tenant_id = $${idx++}::uuid`);
    params.push(filters.tenantId);
  }
  if (filters.from) {
    conditions.push(`timestamp >= $${idx++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`timestamp <= $${idx++}::timestamptz`);
    params.push(filters.to);
  }
  if (filters.q) {
    conditions.push(`message ILIKE $${idx++}`);
    params.push(`%${filters.q}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows, entries] = await Promise.all([
    raw.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${ENTRIES_TABLE} ${where}`,
      params
    ),
    raw.unsafe<LogEntryRecord[]>(
      `SELECT id, timestamp, tenant_id, request_id, level, source, message,
              context, metadata, error, fingerprint
       FROM ${ENTRIES_TABLE} ${where}
       ORDER BY timestamp DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, filters.offset]
    ),
  ]);

  return {
    entries,
    total: parseInt(countRows[0]?.count ?? '0', 10),
    limit: filters.limit,
    offset: filters.offset,
  };
}
