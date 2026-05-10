import type { SystemDatabase } from '@coongro/database-core';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

import {
  AUDIT_EVENTS_TABLE,
  OBSERVABILITY_SCHEMA_NAME,
  auditEvents,
  type AuditEventRow,
} from '../schema/index.js';
import { toUuidOrNull } from '../utils/uuid.js';

/** Key bajo la que se preserva el actor original cuando no es UUID válido. */
export const ACTOR_RAW_METADATA_KEY = 'actorIdRaw';

export interface AuditEventInput {
  action: string;
  tenantId?: string | null;
  /**
   * Identidad del actor. Idealmente UUID — se persiste en `actor_id` (uuid).
   * Si el caller pasa un id no-UUID (ej: WordPress numeric user_id que el
   * sistema usa hoy), se preserva en `metadata.actorIdRaw` y `actor_id` queda
   * NULL. Sin este fallback toda llamada con numeric id rompía el INSERT.
   */
  actorId?: string | number | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Correlation ID del request HTTP que generó este audit. Idealmente leído
   * por el caller del ALS context (ver `AsyncLocalStorage` en core-logging).
   * Permite join con `log_entries.request_id` para reconstruir la cronología
   * completa de un request (logs operacionales + eventos de audit).
   *
   * Null cuando el audit ocurre fuera de un HTTP request (cron, boot, etc.).
   */
  requestId?: string | null;
}

export interface AuditEventQuery {
  tenantId?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  /** Filtra por correlation ID. Útil para reconstruir un request específico. */
  requestId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/**
 * Logger mínimo para reportar fallos de audit sin acoplar al facade completo.
 *
 * Firma estilo Pino: `(message, error?, meta?)`. Coincide con el `Logger` de
 * `@coongro/core-logging` que el host inyecta vía `ModuleAPI.logger`. Pasar
 * el `Error` como segundo argumento es importante — el bridge de pino lo
 * serializa via `serializeError()` y rellena `entry.error.{message,stack,name}`
 * en el sink. Si se pasa `(msg, metaObj)` con la meta como 2do arg, pino
 * trata la meta como Error y persiste `error.message=""` (bug histórico
 * pre-fix de COONG-XX, ver memoria nestjs_pino_meta_loss).
 */
export interface AuditLogger {
  error: (msg: string, error?: unknown, meta?: Record<string, unknown>) => void;
}

/**
 * Registra y consulta eventos de auditoría.
 *
 * `record()` es fire-and-forget para el caller: nunca bloquea ni lanza la
 * operación principal. PERO no es 100% silencioso — los errores se ruteán al
 * `logger.error` inyectado, así un audit table caído deja huella en el log
 * operacional (que va al DBSink y a stdout). Sin esto, una semana entera de
 * audit roto pasaría desapercibida.
 *
 * `query()` es async normal y puede lanzar.
 */
export class AuditLog {
  constructor(
    private readonly db: SystemDatabase,
    private readonly logger: AuditLogger
  ) {}

  record(entry: AuditEventInput): void {
    // Coerción a UUID-o-null: las columnas `tenant_id` y `actor_id` son `uuid`,
    // y un valor no-UUID hace fallar todo el INSERT con `invalid input syntax
    // for type uuid`. tenantId del JWT es UUID, pero `actor_id` recibe el
    // user.id que el sistema mantiene como numeric (WordPress user_id) — sin
    // esta coerción cada audit con caller autenticado fallaba.
    const tenantIdParam = toUuidOrNull(entry.tenantId);
    const actorIdParam = toUuidOrNull(entry.actorId);
    const metadataParam = buildMetadata(entry, actorIdParam);

    // Raw SQL en lugar de Drizzle insert: drizzle-orm 0.38.x tiene un bug con
    // `pgSchema().table()` donde las columnas nullable no aparecen en
    // `$inferInsert`, dejando el INSERT type-incompatible (memoria
    // `drizzle_pgschema_insert_type_bug.md`). `query()` abajo sí usa Drizzle
    // porque el bug solo afecta inserts.
    this.db.raw
      .unsafe(
        `INSERT INTO "${OBSERVABILITY_SCHEMA_NAME}"."${AUDIT_EVENTS_TABLE}"
         (tenant_id, actor_id, action, entity_type, entity_id, metadata, request_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7)`,
        [
          tenantIdParam,
          actorIdParam,
          entry.action,
          entry.entityType ?? null,
          entry.entityId ?? null,
          metadataParam !== null ? JSON.stringify(metadataParam) : null,
          entry.requestId ?? null,
        ]
      )
      .catch((err: unknown) => {
        // Pasamos `err` como 2do arg (no en meta): el bridge pino del host
        // logger lo serializa con stack/name/message. Meta va como 3er arg
        // para preservar action/entityType/entityId. Ver `AuditLogger` JSDoc.
        this.logger.error('audit.record_failed', err, {
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
        });
      });
  }

  async query(filters: AuditEventQuery = {}): Promise<AuditEventRow[]> {
    const conditions: SQL[] = [];

    if (filters.tenantId !== undefined) {
      conditions.push(eq(auditEvents.tenantId, filters.tenantId));
    }
    if (filters.actorId !== undefined) {
      conditions.push(eq(auditEvents.actorId, filters.actorId));
    }
    if (filters.action !== undefined) {
      conditions.push(eq(auditEvents.action, filters.action));
    }
    if (filters.entityType !== undefined) {
      conditions.push(eq(auditEvents.entityType, filters.entityType));
    }
    if (filters.entityId !== undefined) {
      conditions.push(eq(auditEvents.entityId, filters.entityId));
    }
    if (filters.requestId !== undefined) {
      conditions.push(eq(auditEvents.requestId, filters.requestId));
    }
    if (filters.from !== undefined) {
      conditions.push(gte(auditEvents.timestamp, filters.from));
    }
    if (filters.to !== undefined) {
      conditions.push(lte(auditEvents.timestamp, filters.to));
    }

    const limit = Math.max(1, Math.min(filters.limit ?? 100, 1000));

    return this.db.ormQuery((tx) =>
      tx
        .select()
        .from(auditEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditEvents.timestamp))
        .limit(limit)
    );
  }
}

/**
 * Combina la metadata del entry con el `actorIdRaw` cuando el actor original
 * no era UUID válido. Devuelve `null` si no hay nada que persistir, para que
 * el INSERT escriba `NULL` en `metadata` en vez de `'{}'`.
 *
 * El key `actorIdRaw` es estable y queda documentado en `ACTOR_RAW_METADATA_KEY`
 * para que callers/queries puedan reconstruir la identidad del actor cuando
 * el sistema tenga IDs no-UUID (ej: numeric WordPress IDs hoy). Cuando se
 * migre a UUID-only o a la implementación basada en log_entries (COONG-146),
 * este fallback se vuelve inerte sin romper compat.
 */
function buildMetadata(
  entry: AuditEventInput,
  coercedActorId: string | null
): Record<string, unknown> | null {
  const hasOriginalActor = entry.actorId !== undefined && entry.actorId !== null;
  const actorWasCoercedToNull = hasOriginalActor && coercedActorId === null;

  if (!actorWasCoercedToNull) {
    return entry.metadata ?? null;
  }

  return {
    ...(entry.metadata ?? {}),
    [ACTOR_RAW_METADATA_KEY]: String(entry.actorId),
  };
}
