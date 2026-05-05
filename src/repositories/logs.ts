import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

import { where } from './_lib/sql-filters.js';

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
  const { whereClause, params, nextIdx } = where()
    .eq('level', filters.level)
    .eq('source', filters.source)
    .eq('tenant_id', filters.tenantId, { cast: 'uuid' })
    .gte('timestamp', filters.from, { cast: 'timestamptz' })
    .lte('timestamp', filters.to, { cast: 'timestamptz' })
    .ilike('message', filters.q)
    .build();

  const [countRows, entries] = await Promise.all([
    raw.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${ENTRIES_TABLE} ${whereClause}`,
      params
    ),
    raw.unsafe<LogEntryRecord[]>(
      `SELECT id, timestamp, tenant_id, request_id, level, source, message,
              context, metadata, error, fingerprint
       FROM ${ENTRIES_TABLE} ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
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
