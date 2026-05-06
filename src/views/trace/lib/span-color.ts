// Color de la barra de un span según severidad y kind. Centralizado para
// que cualquier vista que renderee spans (Trace hoy, eventualmente
// detalle de span en otros lugares) use la misma paleta.
//
// Reglas, en orden de prioridad:
//   1. status_code === 2 (ERROR de OTel) → red.
//   2. kind === 'CLIENT' (HTTP outbound, DB call) → teal-deep.
//   3. kind === 'SERVER' (entry point) → teal.
//   4. kind === 'PRODUCER'/'CONSUMER' (queue) → gold.
//   5. INTERNAL u otros → neutral-700.
//
// El número 2 viene del enum SpanStatusCode de @opentelemetry/api donde
// UNSET=0, OK=1, ERROR=2.

import type { SpanRecord } from '../../_shared/api.js';

const OTEL_STATUS_CODE_ERROR = 2;

export function spanBarColor(span: SpanRecord): string {
  if (span.status_code === OTEL_STATUS_CODE_ERROR) return 'var(--red)';
  switch (span.kind) {
    case 'CLIENT':
      return 'var(--teal-deep)';
    case 'SERVER':
      return 'var(--teal)';
    case 'PRODUCER':
    case 'CONSUMER':
      return 'var(--gold)';
    default:
      return 'var(--neutral-700)';
  }
}

export function spanBarBackgroundColor(span: SpanRecord): string {
  if (span.status_code === OTEL_STATUS_CODE_ERROR) return 'var(--red-soft)';
  return 'var(--neutral-200)';
}
