// Primitivas de agregación sobre `log_entries` reusables por múltiples views
// y endpoints (Issues, Stream, Salud, Trace, ...).
//
// Cualquier nueva métrica derivada de log_entries (count por hora/minuto/día,
// distinct counts, top-N por dimensión) debería vivir acá si tiene chance de
// servir a más de un consumer. Encerrar primitivas en repos de feature
// específica (ej: `repositories/issues.ts`) ata el primitivo al feature y
// fuerza al siguiente consumer a duplicarlo.

import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_entries"`;

export type BucketGranularity = 'minute' | 'hour' | 'day';

// Para cada granularidad: el unit que aceptan `date_trunc()` y `INTERVAL`
// (postgres acepta singular y plural — usamos singular), más los ms por
// bucket para el cálculo del índice en JS.
const BUCKET_MS: Record<BucketGranularity, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

// Allowlist runtime para defender contra SQL injection si en el futuro la
// granularidad llegara desde un query param (hoy todos los callers la
// hardcodean, pero un endpoint nuevo puede forwardearla sin notar). El
// valor se interpola directo en el SQL (`date_trunc('${granularity}', ...)`)
// — TypeScript no protege en runtime.
const VALID_GRANULARITIES: ReadonlySet<BucketGranularity> = new Set(
  Object.keys(BUCKET_MS) as BucketGranularity[]
);

export interface BucketCountInput {
  /** Lista de fingerprints a buscar. Vacía → resultado vacío sin tocar DB. */
  fingerprints: string[];
  /** Granularidad del bucket. */
  granularity: BucketGranularity;
  /**
   * Cantidad de buckets a devolver, oldest first. Cualquier hora/minuto/día
   * sin eventos viene como 0. La ventana es exactamente
   * `now() - bucketCount * granularity`.
   */
  bucketCount: number;
}

/**
 * Para cada fingerprint, devuelve un array de `bucketCount` enteros con la
 * cantidad de log_entries en cada bucket de `granularity` durante las
 * últimas `bucketCount * granularity`. Los huecos se rellenan con 0.
 *
 * Hace UN solo query batched contra log_entries (no N+1). El relleno y el
 * mapping a índices se hace en memoria — el servidor solo agrupa y cuenta.
 */
export async function bucketCountByFingerprint(
  raw: Sql,
  input: BucketCountInput
): Promise<Map<string, number[]>> {
  // Validación runtime de los dos campos que se interpolan en SQL. TypeScript
  // los garantiza solo si el caller respeta los tipos; cualquier valor que
  // llegue de un query param o JSON necesita esta puerta.
  if (!VALID_GRANULARITIES.has(input.granularity)) {
    throw new Error(`Invalid granularity: ${String(input.granularity)}`);
  }
  if (!Number.isInteger(input.bucketCount) || input.bucketCount <= 0) {
    throw new Error(`bucketCount must be a positive integer, got ${String(input.bucketCount)}`);
  }

  const result = new Map<string, number[]>();
  if (input.fingerprints.length === 0) return result;

  for (const fp of input.fingerprints) {
    result.set(fp, new Array<number>(input.bucketCount).fill(0));
  }

  // Casteamos a timestamptz porque el driver postgres devuelve `timestamp`
  // (sin TZ) como string. Con timestamptz lo recibimos siempre como Date,
  // que es lo que el cálculo de offset abajo necesita. Drift sutil que se
  // descubrió en runtime: `row.bucket_at.getTime is not a function` cuando
  // bucket_at era string.
  const rows = await raw.unsafe<{ fingerprint: string; bucket_at: Date; cnt: string }[]>(
    `SELECT fingerprint,
            date_trunc('${input.granularity}', timestamp)::timestamptz AS bucket_at,
            COUNT(*)::bigint AS cnt
     FROM ${ENTRIES_TABLE}
     WHERE fingerprint = ANY($1::text[])
       AND timestamp >= NOW() - INTERVAL '${input.bucketCount} ${input.granularity}'
     GROUP BY fingerprint, bucket_at`,
    [input.fingerprints]
  );

  // Bucket de referencia: ahora truncado a la granularidad → último índice (newest).
  const nowBucket = truncateToBucket(new Date(), input.granularity);
  const bucketMs = BUCKET_MS[input.granularity];

  for (const row of rows) {
    const arr = result.get(row.fingerprint);
    if (!arr) continue;
    // Defensive: aceptar Date o string ISO por si en algún ambiente el
    // cast a timestamptz no devuelve Date directamente (drivers raros).
    const bucketTime =
      row.bucket_at instanceof Date ? row.bucket_at.getTime() : new Date(row.bucket_at).getTime();
    const bucketsAgo = Math.round((nowBucket.getTime() - bucketTime) / bucketMs);
    const idx = input.bucketCount - 1 - bucketsAgo;
    if (idx >= 0 && idx < input.bucketCount) {
      arr[idx] = parseInt(row.cnt, 10);
    }
  }
  return result;
}

/**
 * Cantidad de tenants distintos que tuvieron al menos un log_entry para
 * cada fingerprint. Devuelve 0 para fingerprints sin tenants no-nulos.
 */
export async function countDistinctTenantsByFingerprint(
  raw: Sql,
  fingerprints: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (fingerprints.length === 0) return result;

  const rows = await raw.unsafe<{ fingerprint: string; tenants: string }[]>(
    `SELECT fingerprint, COUNT(DISTINCT tenant_id)::bigint AS tenants
     FROM ${ENTRIES_TABLE}
     WHERE fingerprint = ANY($1::text[])
       AND tenant_id IS NOT NULL
     GROUP BY fingerprint`,
    [fingerprints]
  );

  for (const row of rows) {
    result.set(row.fingerprint, parseInt(row.tenants, 10));
  }
  return result;
}

function truncateToBucket(date: Date, granularity: BucketGranularity): Date {
  const d = new Date(date);
  d.setMilliseconds(0);
  d.setSeconds(0);
  if (granularity === 'minute') return d;
  d.setMinutes(0);
  if (granularity === 'hour') return d;
  d.setHours(0);
  return d;
}
