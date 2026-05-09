// Constantes del enum OTel SpanStatusCode (UNSET=0, OK=1, ERROR=2). Se
// centralizan acá para que ningún view hardcodee el `2` mágico — la
// referencia es @opentelemetry/api SpanStatusCode.

export const OTEL_STATUS_CODE_UNSET = 0;
export const OTEL_STATUS_CODE_OK = 1;
export const OTEL_STATUS_CODE_ERROR = 2;

export const OTEL_STATUS_CODE_LABEL: Record<number, string> = {
  [OTEL_STATUS_CODE_UNSET]: 'UNSET',
  [OTEL_STATUS_CODE_OK]: 'OK',
  [OTEL_STATUS_CODE_ERROR]: 'ERROR',
};
