// Detección de formato de `request_id` para decidir si un cross-link a
// Trace tiene chance de poblarse o no.
//
// Por qué importa:
//   `request_id` puede provenir de tres fuentes (ver
//   `apps/api/src/common/logger/logger.module.ts:resolveRequestId`):
//
//     1. Header `x-request-id` del caller (cualquier formato)
//     2. OTel traceId del span activo (32 hex chars sin guiones)
//     3. randomUUID() fallback (UUID v4 con guiones)
//
//   Solo (2) matchea con `log_spans.trace_id`. Audits viejos pre-bridge
//   o requests con `x-request-id` custom no tienen spans correspondientes,
//   y abrir Trace les da una vista vacía. Detectar el formato permite
//   esconder el botón cuando sabemos de antemano que va a fallar.
//
//   No es perfecto: alguien podría pasar un `x-request-id` que casualmente
//   sea 32 hex chars y no estar en log_spans. Esa es la cola — la
//   heurística cubre el 99% de casos reales sin requerir un lookup
//   contra la DB para cada row.

const HEX_32_TRACE_ID = /^[0-9a-f]{32}$/i;

/**
 * `true` si el string parece un OTel traceId (32 hex chars sin guiones).
 * `false` para UUIDs con guiones, strings vacíos, null, otros formatos.
 */
export function isOtelTraceId(requestId: string | null | undefined): boolean {
  return typeof requestId === 'string' && HEX_32_TRACE_ID.test(requestId);
}
