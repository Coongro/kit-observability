import { PartitionManager } from '@coongro/database-core';
import type { Sql } from 'postgres';

import type { ObservabilityConfig } from '../config.js';
import { LOG_ENTRIES_TABLE } from '../schema/log-entries.js';
import { LOG_SPANS_TABLE } from '../schema/log-spans.js';
import { OBSERVABILITY_SCHEMA_NAME } from '../schema/observability-schema.js';

export interface RegisterPartitionsLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Registra las tablas particionadas con pg_partman.
 *
 * Bajo el capó, `PartitionManager.register()` invoca `partman.create_parent(...)`
 * — el `CREATE TABLE ... PARTITION BY RANGE(timestamp)` del bootstrap solo
 * crea la tabla parent vacía; SIN `partman.create_parent` no existen las
 * particiones diarias y los INSERTs caen al "default partition" (o fallan
 * si no hay default, que es nuestro caso). Por eso el bootstrap NO se
 * considera completo hasta que esto corre.
 *
 * Idempotente — `PartitionManager.register()` retorna `{ created: false }`
 * si ya estaba en `part_config`.
 *
 * Diseñado para que G2 (SpanSink) y G4 (retention agresiva) no necesiten
 * agregar tablas nuevas: este módulo cubre todas las particionadas del plugin
 * (entries + spans). Si en el futuro hay otra, solo se suma una llamada acá.
 */
export async function registerPartitions(
  raw: Sql,
  config: ObservabilityConfig,
  logger: RegisterPartitionsLogger
): Promise<void> {
  const manager = new PartitionManager(raw);
  await manager.initialize();

  const entriesResult = await manager.register({
    schemaName: OBSERVABILITY_SCHEMA_NAME,
    tableName: LOG_ENTRIES_TABLE,
    partitionColumn: 'timestamp',
    interval: '1 day',
    premake: config.partitionPremake,
    // PartitionManager rechaza retentionKeepTable cuando retention es null —
    // por eso solo se incluye el field cuando retention efectivamente aplica.
    ...(config.retentionDaysEntries !== null
      ? { retention: `${config.retentionDaysEntries} days`, retentionKeepTable: false }
      : {}),
  });
  logger.info('log_entries partitions registered', {
    created: entriesResult.created,
    parentTable: entriesResult.parentTable,
  });

  const spansResult = await manager.register({
    schemaName: OBSERVABILITY_SCHEMA_NAME,
    tableName: LOG_SPANS_TABLE,
    partitionColumn: 'start_time',
    interval: '1 day',
    premake: config.partitionPremake,
    ...(config.retentionDaysSpans !== null
      ? { retention: `${config.retentionDaysSpans} days`, retentionKeepTable: false }
      : {}),
  });
  logger.info('log_spans partitions registered', {
    created: spansResult.created,
    parentTable: spansResult.parentTable,
  });
}
