import type { Sql } from 'postgres';

import { type IssueStatus, OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

import { where } from './_lib/sql-filters.js';
import { bucketCountByFingerprint, countDistinctTenantsByFingerprint } from './aggregates.js';

const ISSUES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_issues"`;
const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_entries"`;
const SPARKLINE_BUCKETS = 24;

/** Devuelve true si el issue existía y fue actualizado, false si no existe. */
export async function updateIssueStatus(
  raw: Sql,
  id: string,
  status: IssueStatus
): Promise<boolean> {
  const rows = await raw.unsafe<{ id: string }[]>(
    `UPDATE ${ISSUES_TABLE} SET status = $1 WHERE id = $2::uuid RETURNING id`,
    [status, id]
  );
  return rows.length > 0;
}

export interface IssueQueryFilters {
  level?: number;
  status?: IssueStatus | IssueStatus[];
  tenantId?: string;
  source?: string;
  q?: string;
  /** Filtra por `last_seen_at >= from` (ISO string). */
  from?: string;
  /** Filtra por `last_seen_at <= to` (ISO string). */
  to?: string;
  limit: number;
  offset: number;
}

export interface IssueRowDb {
  id: string;
  fingerprint: string;
  tenant_id: string | null;
  level: number;
  source: string;
  sample_message: string;
  sample_top_frame: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  occurrence_count: string;
  status: IssueStatus;
}

export interface IssueListRowDb extends IssueRowDb {
  /** Cantidad de tenants distintos que vieron este issue (de log_entries). */
  affected_tenants_count: number;
  /** Sparkline de las últimas 24h, exactamente 24 buckets, oldest first. */
  sparkline_24h: number[];
}

export interface IssueQueryResult {
  rows: IssueListRowDb[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Lista issues filtrando por nivel/status/tenant/source/range, ordenado por
 * `last_seen_at DESC`. Para los issues devueltos enriquece con sparkline 24h
 * y count de tenants afectados, ambas obtenidas de log_entries via las
 * primitivas batched de `aggregates.ts` (un solo query batched, no N+1).
 */
export async function queryIssues(raw: Sql, filters: IssueQueryFilters): Promise<IssueQueryResult> {
  const statuses =
    filters.status === undefined
      ? undefined
      : Array.isArray(filters.status)
        ? filters.status
        : [filters.status];

  const { whereClause, params, nextIdx } = where()
    .eq('level', filters.level)
    .inList('status', statuses)
    .eq('tenant_id', filters.tenantId, { cast: 'uuid' })
    .eq('source', filters.source)
    .ilike('sample_message', filters.q)
    .gte('last_seen_at', filters.from, { cast: 'timestamptz' })
    .lte('last_seen_at', filters.to, { cast: 'timestamptz' })
    .build();

  const [countRows, rows] = await Promise.all([
    raw.unsafe<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${ISSUES_TABLE} ${whereClause}`,
      params
    ),
    raw.unsafe<IssueRowDb[]>(
      `SELECT id, fingerprint, tenant_id, level, source,
              sample_message, sample_top_frame,
              first_seen_at, last_seen_at, occurrence_count, status
       FROM ${ISSUES_TABLE} ${whereClause}
       ORDER BY last_seen_at DESC
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
      [...params, filters.limit, filters.offset]
    ),
  ]);

  const fingerprints = rows.map((r) => r.fingerprint);
  const enriched = await enrichWithAggregates(raw, rows, fingerprints);

  return {
    rows: enriched,
    total: parseInt(countRows[0]?.count ?? '0', 10),
    limit: filters.limit,
    offset: filters.offset,
  };
}

async function enrichWithAggregates(
  raw: Sql,
  rows: IssueRowDb[],
  fingerprints: string[]
): Promise<IssueListRowDb[]> {
  const [sparklines, tenantCounts] = await Promise.all([
    bucketCountByFingerprint(raw, {
      fingerprints,
      granularity: 'hour',
      bucketCount: SPARKLINE_BUCKETS,
    }),
    countDistinctTenantsByFingerprint(raw, fingerprints),
  ]);

  return rows.map((r) => ({
    ...r,
    sparkline_24h: sparklines.get(r.fingerprint) ?? new Array<number>(SPARKLINE_BUCKETS).fill(0),
    affected_tenants_count: tenantCounts.get(r.fingerprint) ?? 0,
  }));
}

// =============================================================================
// Detail
// =============================================================================

export interface AffectedTenantRow {
  tenant_id: string;
  count: number;
  last_seen: Date;
}

export interface SimilarEventRow {
  id: string;
  timestamp: Date;
  tenant_id: string | null;
  request_id: string | null;
  level: number;
  message: string;
}

export interface SampleLogEntryRow {
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
}

export interface IssueDetail {
  issue: IssueListRowDb | null;
  sample: SampleLogEntryRow | null;
  affectedTenants: AffectedTenantRow[];
  similarEvents: SimilarEventRow[];
}

const SIMILAR_EVENTS_LIMIT = 6;
const AFFECTED_TENANTS_LIMIT = 50;

/**
 * Devuelve toda la info necesaria para renderizar el detail panel de un
 * issue: el row del issue (con sparkline + tenant count enriquecidos), un
 * log_entry sample para el stack trace + meta JSON, lista de tenants
 * afectados con su último timestamp, y los últimos N eventos del mismo
 * fingerprint.
 *
 * Si el fingerprint no existe en log_issues, todos los campos vienen vacíos
 * (issue=null, listas vacías). El endpoint decide si responder 404 o
 * devolver el shape completo.
 */
export async function getIssueDetail(raw: Sql, fingerprint: string): Promise<IssueDetail> {
  const [issueRows, sampleRows, affectedTenants, similarEvents] = await Promise.all([
    raw.unsafe<IssueRowDb[]>(
      `SELECT id, fingerprint, tenant_id, level, source,
              sample_message, sample_top_frame,
              first_seen_at, last_seen_at, occurrence_count, status
       FROM ${ISSUES_TABLE}
       WHERE fingerprint = $1
       LIMIT 1`,
      [fingerprint]
    ),
    raw.unsafe<SampleLogEntryRow[]>(
      `SELECT id, timestamp, tenant_id, request_id, level, source, message,
              context, metadata, error
       FROM ${ENTRIES_TABLE}
       WHERE fingerprint = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [fingerprint]
    ),
    raw.unsafe<{ tenant_id: string; cnt: string; last_seen: Date }[]>(
      `SELECT tenant_id, COUNT(*)::bigint AS cnt, MAX(timestamp) AS last_seen
       FROM ${ENTRIES_TABLE}
       WHERE fingerprint = $1 AND tenant_id IS NOT NULL
       GROUP BY tenant_id
       ORDER BY last_seen DESC
       LIMIT $2`,
      [fingerprint, AFFECTED_TENANTS_LIMIT]
    ),
    raw.unsafe<SimilarEventRow[]>(
      `SELECT id, timestamp, tenant_id, request_id, level, message
       FROM ${ENTRIES_TABLE}
       WHERE fingerprint = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [fingerprint, SIMILAR_EVENTS_LIMIT]
    ),
  ]);

  const enriched = issueRows[0]
    ? (await enrichWithAggregates(raw, issueRows, [fingerprint]))[0]
    : null;

  return {
    issue: enriched,
    sample: sampleRows[0] ?? null,
    affectedTenants: affectedTenants.map((r) => ({
      tenant_id: r.tenant_id,
      count: parseInt(r.cnt, 10),
      last_seen: r.last_seen,
    })),
    similarEvents,
  };
}
