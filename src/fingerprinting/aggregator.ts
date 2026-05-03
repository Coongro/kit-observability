import type { Sql } from 'postgres';

import { LOG_ISSUES_TABLE } from '../schema/log-issues.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

/**
 * Input crudo del aggregator — UN evento de log que contribuye al issue
 * (sin el `count`, que se establece después de pre-agregar).
 *
 * Este es el shape que producen los sinks (DBSink filtra entries level >= WARN
 * y los mapea a este shape). Pre-agregar a `AggregatorInput` agrupa por
 * fingerprint y suma counts antes de tocar la DB.
 */
export interface RawAggregatorInput {
  fingerprint: string;
  level: number;
  source: string;
  sampleMessage: string;
  sampleTopFrame: string | null;
  tenantId: string | null;
}

/**
 * Input post-agregación (lo que recibe `recordIssues`). Tiene `count >= 1`
 * que representa cuántas occurrences de este fingerprint sumar al UPSERT.
 *
 * Forzar este tipo en el contrato de `recordIssues` evita el bug donde el
 * caller envía la misma fingerprint N veces en el batch — el ON CONFLICT
 * solo dispara una vez y se pierden N-1 counts. Pre-agregar es obligatorio.
 */
export interface AggregatorInput extends RawAggregatorInput {
  /** Cantidad de occurrences a sumar en este UPSERT. Debe ser >= 1. */
  count: number;
}

const TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."${LOG_ISSUES_TABLE}"`;

/**
 * Agrupa una lista de inputs por fingerprint, sumando counts. El sample del
 * último input gana (estado actual).
 */
export function preAggregate(inputs: readonly RawAggregatorInput[]): AggregatorInput[] {
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
 * `occurrence_count += EXCLUDED.occurrence_count`, lo que junto con la
 * pre-agregación en JS asegura que el contador sea correcto incluso
 * con concurrencia entre múltiples sinks/procesos.
 *
 * Se usa alias `t` para la target table (`INSERT INTO ... AS t`) en vez de
 * referenciar el nombre de tabla en el SET. Esto evita un footgun: si en el
 * futuro `LOG_ISSUES_TABLE` lleva caracteres no-identifier (improbable pero
 * posible), el ON CONFLICT seguiría compilando sin necesidad de quoting.
 */
export async function recordIssues(raw: Sql, inputs: readonly AggregatorInput[]): Promise<void> {
  if (inputs.length === 0) return;

  const FIELDS_PER_ROW = 7;
  const placeholders = inputs
    .map((_, i) => {
      const o = i * FIELDS_PER_ROW;
      return `($${o + 1}, $${o + 2}::uuid, $${o + 3}::int, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}::bigint, NOW(), NOW())`;
    })
    .join(', ');

  const params: (string | number | null)[] = [];
  for (const i of inputs) {
    params.push(
      i.fingerprint,
      i.tenantId,
      i.level,
      i.source,
      i.sampleMessage,
      i.sampleTopFrame,
      i.count
    );
  }

  await raw.unsafe(
    `INSERT INTO ${TABLE} AS t
       (fingerprint, tenant_id, level, source, sample_message, sample_top_frame, occurrence_count, first_seen_at, last_seen_at)
     VALUES ${placeholders}
     ON CONFLICT (fingerprint) DO UPDATE SET
       occurrence_count = t.occurrence_count + EXCLUDED.occurrence_count,
       last_seen_at = NOW(),
       sample_message = EXCLUDED.sample_message,
       sample_top_frame = EXCLUDED.sample_top_frame`,
    params
  );
}
