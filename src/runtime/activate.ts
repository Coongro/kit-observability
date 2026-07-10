import { addSink, getSink, setAuditRecorder } from '@coongro/core-logging';
import type { ModuleActivationContext } from '@coongro/module-core';

import { AuditLog } from '../audit/index.js';
import { runBootstrap } from '../bootstrap/run-bootstrap.js';
import { isObservabilityDisabled, loadConfig } from '../config.js';
import { registerPartitions } from '../partitions/register.js';
import { DBSink } from '../sinks/db-sink.js';
import { FileFailsafeWriter } from '../sinks/failsafe-writer.js';
import { SpanSink } from '../sinks/span-sink.js';

import { adaptLogger, type CompatLogger } from './compat-logger.js';
import { getRuntimeStateOrNull, setRuntimeState } from './state.js';

/**
 * Registra el DBSink en el registry global resolviendo la idempotencia de
 * hot-reload: si ya había un sink con el mismo id (re-activación), reutiliza la
 * instancia ORIGINAL del registry y cierra el `newSink` huérfano para no leakear
 * el FD de su FileFailsafeWriter. Devuelve el sink activo y si fue reutilizado.
 *
 * Duck-typing por id en vez de instanceof: cada tenant eager carga el plugin en
 * su propio snapshot de módulo, haciendo que instanceof falle entre instancias
 * aunque el objeto sea funcionalmente el mismo DBSink.
 */
async function resolveDbSink(
  newSink: DBSink,
  logger: CompatLogger
): Promise<{ sink: DBSink; reused: boolean }> {
  if (addSink(newSink)) {
    return { sink: newSink, reused: false };
  }
  const existing = getSink(newSink.id);
  if (existing !== null && existing.id === newSink.id) {
    await newSink.close();
    logger.warn('DBSink already registered, reusing existing instance from registry');
    return { sink: existing as unknown as DBSink, reused: true };
  }
  // Caso patológico: un sink con nuestro id existe pero tiene ID distinto.
  await newSink.close();
  throw new Error(
    `[kit-observability] getSink("${newSink.id}") returned unexpected sink — cannot continue`
  );
}

/**
 * activate() del plugin. Llamado por el plugin loader del API al boot
 * (por `runtime: 'eager'` declarado en el manifest).
 *
 * Orden de operaciones — cada paso hace fail-fast si algo no encaja, así el
 * plugin queda OUT en vez de quedar en estado inconsistente:
 *   1. Validar que `api.systemDatabase` esté disponible. Sin él el plugin
 *      no puede ni hacer bootstrap ni persistir logs — abortar el activate.
 *   2. Cargar config de env vars (puede throwear si una env var es inválida).
 *   3. Bootstrap idempotente del schema observability + tablas + version row
 *      (transaccional — si falla a mitad, rollback completo).
 *   4. Registrar tablas particionadas con pg_partman.
 *   5. Crear el FailsafeWriter (mkdir + sync size).
 *   6. Instanciar DBSink con todo lo de arriba.
 *   7. addSink(dbSink) en el registry global de core-logging.
 *      Si retorna false (sink ya existía), descartamos el nuevo (cerrando su
 *      failsafe writer para evitar FD leak) y reusamos la instancia del
 *      registry — sino el `runtime/state` apuntaría a una instancia que el
 *      registry rechazó y nunca recibe writes.
 *   8. Guardar runtime state para que el cron handler (maintenance) acceda.
 */
export async function activate(context: ModuleActivationContext): Promise<void> {
  const logger = adaptLogger(context.api.logger);

  // Master kill-switch (OBSERVABILITY_DISABLED=1): cortar el plugin entero ANTES
  // de tocar nada. Sin bootstrap, sin sinks, sin audit recorder, sin runtime
  // state → cero escrituras a la DB. Los crons quedan no-op porque
  // getRuntimeStateOrNull() devuelve null (ver crons/maintenance|retention).
  if (isObservabilityDisabled()) {
    logger.warn(
      'kit-observability DESACTIVADO via OBSERVABILITY_DISABLED=1 — no se registran sinks, crons, audit recorder ni bootstrap (cero escrituras a la DB)'
    );
    return;
  }

  if (!context.api.systemDatabase) {
    throw new Error(
      '[kit-observability] api.systemDatabase is required but not available in this runtime — plugin cannot bootstrap'
    );
  }
  const systemDb = context.api.systemDatabase;
  const config = loadConfig();

  await runBootstrap(systemDb.raw, logger);
  await registerPartitions(systemDb.raw, config, logger);

  const failsafe = new FileFailsafeWriter(
    config.failsafeDir,
    config.failsafeMaxFileBytes,
    config.failsafeMaxFiles
  );

  const newSink = new DBSink({
    raw: systemDb.raw,
    minLevel: config.dbMinLevel, // antes default DEBUG → persistía el ruido INFO del bridge. Ver dbMinLevel.
    batchSize: config.batchSize,
    batchIntervalMs: config.batchIntervalMs,
    failsafe,
  });

  const { sink: activeSink, reused: dbSinkReused } = await resolveDbSink(newSink, logger);

  // ── SpanSink ──────────────────────────────────────────────────────────────
  // Mismo patrón de idempotencia que DBSink: en hot-reload, RuntimeState ya
  // tiene una instancia activa registrada en el OTel provider — reutilizarla
  // en vez de añadir un segundo processor al fan-out.
  const prevState = getRuntimeStateOrNull();
  let activeSpanSink: SpanSink;
  let spanSinkReused = false;

  if (prevState?.spanSink) {
    activeSpanSink = prevState.spanSink;
    spanSinkReused = true;
    logger.warn('SpanSink already active in OTel provider, reusing existing instance');
  } else {
    const spanFailsafe = new FileFailsafeWriter(
      config.failsafeDir,
      config.failsafeMaxFileBytes,
      config.failsafeMaxFiles
    );
    activeSpanSink = new SpanSink({
      raw: systemDb.raw,
      batchSize: config.batchSize,
      batchIntervalMs: config.batchIntervalMs,
      failsafe: spanFailsafe,
    });
    context.api.addSpanProcessor?.(activeSpanSink);
  }

  const auditLog = new AuditLog(systemDb, logger);
  setRuntimeState({
    systemDb,
    config,
    dbSink: activeSink,
    spanSink: activeSpanSink,
    auditLog,
    removeSpanProcessor: context.api.removeSpanProcessor
      ? (p) => context.api.removeSpanProcessor(p)
      : undefined,
  });

  // Registrar el AuditLog como recorder global de @coongro/core-logging para
  // que el core (action listeners, auth, tenants) pueda emitir audit events
  // sin depender directo de este plugin. Idempotente por la misma referencia
  // — en hot-reload la 2da llamada con el mismo objeto es silenciosa.
  // Si en algún momento queremos cleanup en deactivate(), llamar
  // `clearAuditRecorder()`. Por ahora no hay deactivate hook en este plugin.
  setAuditRecorder(auditLog);
  logger.info('kit-observability activated', {
    dbSinkId: activeSink.id,
    spanSinkId: activeSpanSink.id,
    batchSize: config.batchSize,
    batchIntervalMs: config.batchIntervalMs,
    dbSinkReused,
    spanSinkReused,
    otelEnabled:
      context.api.addSpanProcessor !== null && context.api.addSpanProcessor !== undefined,
  });
}
