import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Schema PostgreSQL donde viven todas las tablas del plugin.
 *
 * Centralizado en una sola constante para que cualquier sub-feature (G2 spans,
 * G3 endpoints, G4 retention, G5 audit) referencie el mismo nombre y no haya
 * drift de strings hardcodeadas.
 */
export const OBSERVABILITY_SCHEMA_NAME = 'observability';

export const observabilitySchema = pgSchema(OBSERVABILITY_SCHEMA_NAME);
