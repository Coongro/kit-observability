// Cliente HTTP tipado para los endpoints del plugin kit-observability.
// Los views consumen únicamente este módulo: nunca llaman fetch() directo
// para que cualquier cambio en el contrato (paths, query params, base url)
// se concentre acá.
//
// Los tipos de request/response están definidos en src/types/wire.ts y son
// compartidos con los handlers del backend.

import type {
  WireIngestLogResponse,
  WireIssueDetail,
  WireIssueStatus,
  WireListTenantsResult,
  WirePluginHealth,
  WireQueryAuditResult,
  WireQueryIssuesResult,
  WireQueryLogsResult,
  WireTraceQueryResult,
  WireUpdateIssueResponse,
} from '../../types/wire.js';

// Re-exports convenientes para que los views importen tipos y funciones
// desde un único módulo.
export type {
  WireAffectedTenant as AffectedTenant,
  WireAuditEvent as AuditEvent,
  WireIssueDetail as IssueDetail,
  WireIssueStatus as IssueStatus,
  WireLogEntry as LogEntry,
  WireLogIssue as LogIssue,
  WirePluginHealth as PluginHealth,
  WireQueryAuditResult,
  WireQueryIssuesResult,
  WireQueryLogsResult,
  WireSampleLogEntry as SampleLogEntry,
  WireSimilarEvent as SimilarEvent,
  WireSinkHealth as SinkHealth,
  WireSpanRecord as SpanRecord,
  WireTenantOption as TenantOption,
  WireTraceQueryResult as TraceQueryResult,
} from '../../types/wire.js';

const PLUGIN_PATH = '/plugins/kit-observability';

/**
 * Resuelve el prefix HTTP donde están montados los endpoints del plugin.
 *
 * - Si el host de Coongro expone `window.coongro.apiBaseUrl` (cross-origin
 *   plugin loading, planeado para producción cuando la web esté en
 *   Cloudflare Pages y la API en Railway), se usa ese valor + el path del
 *   plugin.
 * - Si no, se cae a `/api${PLUGIN_PATH}` relativo, que funciona en dev
 *   (Vite proxy) y en cualquier entorno same-origin.
 *
 * Mantenemos el ID corto del plugin (`kit-observability`) porque el
 * PluginHttpController del host le agrega el scope `@coongro/`
 * automáticamente al resolver el endpoint.
 */
function getPluginBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const fromHost = (window as unknown as { coongro?: { apiBaseUrl?: string } }).coongro
      ?.apiBaseUrl;
    if (typeof fromHost === 'string' && fromHost.length > 0) {
      return `${fromHost.replace(/\/$/, '')}${PLUGIN_PATH}`;
    }
  }
  return `/api${PLUGIN_PATH}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly endpoint: string,
    public readonly body?: unknown
  ) {
    super(`[${status}] ${endpoint}: ${message}`);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends Omit<RequestInit, 'body' | 'signal'> {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const url = `${getPluginBaseUrl()}${path}`;
  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(url, init);
  const text = await res.text();
  // Si la respuesta es vacía (204) devolvemos undefined; para todo lo demás
  // intentamos parsear JSON. Distinguimos dos casos del fallo de parse:
  //   - res.ok=false (error response): toleramos texto plano porque proxies
  //     intermedios devuelven HTML/text sin content-type JSON.
  //   - res.ok=true (success response): parse fallido es contrato roto del
  //     servidor — antes el código casteaba el string como T y los callers
  //     crasheaban downstream con un error confuso. Ahora tiramos ApiError
  //     status 502 (Bad Gateway-ish) para que falle ruidoso en el caller.
  let payload: unknown = undefined;
  let parseFailed = false;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
      parseFailed = true;
    }
  }

  if (!res.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : typeof payload === 'string'
          ? payload
          : res.statusText;
    throw new ApiError(res.status, message, path, payload);
  }

  if (parseFailed) {
    throw new ApiError(502, 'invalid JSON response from server', path, payload);
  }

  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s.length === 0 ? '' : `?${s}`;
}

// =============================================================================
// 1) GET /logs/query
// =============================================================================

export interface QueryLogsParams {
  level?: number;
  source?: string;
  tenantId?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export function queryLogs(params: QueryLogsParams = {}): Promise<WireQueryLogsResult> {
  const qs = buildQuery({
    level: params.level,
    source: params.source,
    tenant_id: params.tenantId,
    from: params.from,
    to: params.to,
    q: params.q,
    limit: params.limit,
    offset: params.offset,
  });
  return request<WireQueryLogsResult>(`/logs/query${qs}`, { signal: params.signal });
}

// =============================================================================
// 2) POST /logs — ingestion de errores del frontend (auth: 'none')
// =============================================================================

export interface IngestLogInput {
  message: string;
  level?: number;
  stack?: string;
  url?: string;
  userAgent?: string;
  tenantId?: string;
  signal?: AbortSignal;
}

export function ingestLog(input: IngestLogInput): Promise<WireIngestLogResponse> {
  const { signal, userAgent, tenantId, ...rest } = input;
  return request<WireIngestLogResponse>('/logs', {
    method: 'POST',
    body: {
      ...rest,
      user_agent: userAgent,
      tenant_id: tenantId,
    },
    signal,
  });
}

// =============================================================================
// 3a) GET /logs/issues — listado de issues
// =============================================================================

export interface QueryIssuesParams {
  level?: number;
  /** Lista de statuses a incluir. Se serializa como CSV en el query string. */
  status?: WireIssueStatus[];
  tenantId?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export function queryIssues(params: QueryIssuesParams = {}): Promise<WireQueryIssuesResult> {
  const qs = buildQuery({
    level: params.level,
    status: params.status && params.status.length > 0 ? params.status.join(',') : undefined,
    tenant_id: params.tenantId,
    source: params.source,
    q: params.q,
    from: params.from,
    to: params.to,
    limit: params.limit,
    offset: params.offset,
  });
  return request<WireQueryIssuesResult>(`/logs/issues${qs}`, { signal: params.signal });
}

// =============================================================================
// 3b) GET /logs/issues/detail
// =============================================================================

export function getIssueDetail(
  fingerprint: string,
  options: { signal?: AbortSignal } = {}
): Promise<WireIssueDetail> {
  return request<WireIssueDetail>(`/logs/issues/detail${buildQuery({ fingerprint })}`, {
    signal: options.signal,
  });
}

// =============================================================================
// 3c) PATCH /logs/issues
// =============================================================================

export function updateIssueStatus(
  id: string,
  status: WireIssueStatus,
  options: { signal?: AbortSignal } = {}
): Promise<WireUpdateIssueResponse> {
  return request<WireUpdateIssueResponse>(`/logs/issues${buildQuery({ id })}`, {
    method: 'PATCH',
    body: { status },
    signal: options.signal,
  });
}

// =============================================================================
// 4) GET /logs/health
// =============================================================================

export function getHealth(options: { signal?: AbortSignal } = {}): Promise<WirePluginHealth> {
  return request<WirePluginHealth>('/logs/health', { signal: options.signal });
}

// =============================================================================
// 5) GET /audit
// =============================================================================

export interface QueryAuditParams {
  tenantId?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  signal?: AbortSignal;
}

export function queryAudit(params: QueryAuditParams = {}): Promise<WireQueryAuditResult> {
  const qs = buildQuery({
    tenant_id: params.tenantId,
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    from: params.from,
    to: params.to,
    limit: params.limit,
  });
  return request<WireQueryAuditResult>(`/audit${qs}`, { signal: params.signal });
}

// =============================================================================
// 6) GET /tenants — listado de tenants activos
// =============================================================================

export function listTenants(
  options: { signal?: AbortSignal } = {}
): Promise<WireListTenantsResult> {
  return request<WireListTenantsResult>('/tenants', { signal: options.signal });
}

// =============================================================================
// 7) GET /traces?trace_id=...
// =============================================================================

export function getTrace(
  traceId: string,
  options: { signal?: AbortSignal } = {}
): Promise<WireTraceQueryResult> {
  return request<WireTraceQueryResult>(`/traces${buildQuery({ trace_id: traceId })}`, {
    signal: options.signal,
  });
}
