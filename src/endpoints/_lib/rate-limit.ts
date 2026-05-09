/**
 * Token bucket por clave (típicamente actor_id). In-memory, per-process.
 *
 * Limitación conocida: si la API corre en multi-instancia, cada proceso tiene su
 * propio bucket → el límite efectivo se multiplica por N. Suficiente para uso
 * interno; si en algún momento se escala, mover a Redis.
 */

export interface RateLimitConfig {
  /** Tokens que se reponen por minuto. */
  refillPerMin: number;
  /** Capacidad máxima del bucket (tope de burst). */
  burst: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const refillPerMs = cfg.refillPerMin / 60_000;
  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: cfg.burst, lastRefill: now };

  if (existing) {
    const elapsed = now - existing.lastRefill;
    bucket.tokens = Math.min(cfg.burst, existing.tokens + elapsed * refillPerMs);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { allowed: true, retryAfterMs: 0 };
  }

  buckets.set(key, bucket);
  const deficit = 1 - bucket.tokens;
  return { allowed: false, retryAfterMs: Math.ceil(deficit / refillPerMs) };
}

/** Test helper — limpia el estado entre tests. */
export function _resetRateLimitState(): void {
  buckets.clear();
}
