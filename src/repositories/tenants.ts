// Lista de tenants para los selectores de filtro de las views del plugin.
// Lectura cross-tenant via systemDb (solo `kit-observability` por ser
// internal-only — un plugin de cliente NO debería tener acceso a los
// tenants ajenos, ver memoria `kit_observability_internal_only.md`).

import type { Sql } from 'postgres';

export interface TenantOptionRow {
  id: string;
  name: string;
}

/**
 * Devuelve los tenants activos ordenados por nombre. Usado por
 * `TenantFilterChip` para autocompletar el dropdown — el filtro real lo
 * aplica cada endpoint contra `tenant_id` de las tablas particionadas.
 *
 * Nota: leemos de `public.tenants` directo, no usamos el TenantsService del
 * host porque el plugin no tiene acceso al runtime de NestJS (solo al
 * systemDb). El shape `{id, name}` es estable; si en el futuro hay otros
 * campos visibles (status, plan), agregar acá.
 */
export async function listActiveTenants(raw: Sql): Promise<TenantOptionRow[]> {
  return raw.unsafe<TenantOptionRow[]>(
    `SELECT id::text AS id, name
     FROM public.tenants
     WHERE status = 'active'
     ORDER BY name ASC`
  );
}
