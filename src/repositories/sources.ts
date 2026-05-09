// Lista de `source`s distintos para los selectores de filtro en las views.
// Cross-tenant via systemDb (kit-observability es internal-only — los
// operadores Coongro deben poder filtrar por cualquier source que haya
// emitido un log, sin importar a qué tenant pertenece).

import type { Sql } from 'postgres';

import { OBSERVABILITY_SCHEMA_NAME } from '../schema/index.js';

const ENTRIES_TABLE = `"${OBSERVABILITY_SCHEMA_NAME}"."log_entries"`;

export interface SourceOptionRow {
  source: string;
  count: number;
  last_seen: Date | string;
}

/**
 * Devuelve los `source`s distintos que aparecieron en log_entries durante
 * los últimos N días, ordenados por uso reciente (last_seen DESC). El
 * dropdown de SOURCE en Issues/Stream/Auditoría muestra esto para que el
 * operador no tenga que recordar el string exacto del source.
 *
 * Por qué la ventana: si filtramos sin límite temporal, sources que se
 * deprecataron hace meses siguen apareciendo y ensucian la lista.
 * 14 días cubre el ciclo típico de retention sin esconder sources reales.
 *
 * Por qué LIMIT 200: protegemos contra escenarios donde un bug genere
 * miles de sources distintos (typos, IDs en lugar de nombres) — la lista
 * no debería ser más larga que un menú UI utilizable.
 */
export async function listRecentSources(raw: Sql): Promise<SourceOptionRow[]> {
  return raw.unsafe<SourceOptionRow[]>(
    `SELECT source,
            COUNT(*)::int AS count,
            MAX(timestamp)::timestamptz AS last_seen
     FROM ${ENTRIES_TABLE}
     WHERE timestamp >= NOW() - INTERVAL '14 days'
     GROUP BY source
     ORDER BY last_seen DESC
     LIMIT 200`
  );
}
