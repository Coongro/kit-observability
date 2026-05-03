import type { Sql } from 'postgres';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';
import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';

export interface AggregatorInput {
  fingerprint: string;
  /**
   * Cantidad de occurrences a sumar en este UPSERT. El caller debe pre-agregar
   * en JS antes de llamar (sino el ON CONFLICT solo dispara una vez por
   * fingerprint dentro del batch y los counts se pierden).
   */
  count: number;
  level: number;
  source: string;
  sampleMessage: string;
  sampleTopFrame: string | null;
  tenantId: string | null;
}

const TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ISSUES_TABLE}"`;

/**
 * Agrupa una lista de inputs por fingerprint, sumando los `count`. Necesario
 * antes de llamar a `recordIssues` con un batch donde el mismo fingerprint
 * aparece varias veces.
 */
export function preAggregate(
  inputs: readonly Omit<AggregatorInput, 'count'>[]
): AggregatorInput[] {
  const byFingerprint = new Map<string, AggregatorInput>();
  for (const input of inputs) {
    const existing = byFingerprint.get(input.fingerprint);
    if (existing === undefined) {
      byFingerprint.set(input.fingerprint, { ...input, count: 1 });
    } else {
      existing.count += 1;
      // Mantener el sample más reciente para reflejar el estado actual.
      existing.sampleMessage = input.sampleMessage;
      existing.sampleTopFrame = input.sampleTopFrame;
    }
  }
  return [...byFingerprint.values()];
}

/**
 * UPSERT atómico al log_issues. ON CONFLICT (fingerprint) hace
 * occurrence_count += EXCLUDED.occurrence_count, lo que junto con la
 * pre-agregación en JS asegura que el contador sea correcto incluso
 * con concurrencia entre múltiples sinks/procesos.
 */
export async function recordIssues(
  raw: Sql,
  inputs: readonly AggregatorInput[]
): Promise<void> {
  if (inputs.length === 0) return;

  const rows = inputs.map((i) => ({
    fingerprint: i.fingerprint,
    tenant_id: i.tenantId,
    level: i.level,
    source: i.source,
    sample_message: i.sampleMessage,
    sample_top_frame: i.sampleTopFrame,
    occurrence_count: i.count,
  }));

  await raw.unsafe(
    `INSERT INTO ${TABLE}
       (fingerprint, tenant_id, level, source, sample_message, sample_top_frame, occurrence_count, first_seen_at, last_seen_at)
     SELECT
       v.fingerprint, v.tenant_id::uuid, v.level::int, v.source, v.sample_message, v.sample_top_frame, v.occurrence_count::bigint, NOW(), NOW()
     FROM jsonb_to_recordset($1::jsonb) AS v(
       fingerprint text, tenant_id text, level int, source text,
       sample_message text, sample_top_frame text, occurrence_count bigint
     )
     ON CONFLICT (fingerprint) DO UPDATE SET
       occurrence_count = ${LOG_ISSUES_TABLE}.occurrence_count + EXCLUDED.occurrence_count,
       last_seen_at = NOW(),
       sample_message = EXCLUDED.sample_message,
       sample_top_frame = EXCLUDED.sample_top_frame`,
    [JSON.stringify(rows)]
  );
}
