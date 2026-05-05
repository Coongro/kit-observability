// WhereBuilder — construye dinámicamente la cláusula WHERE de una query
// con placeholders posicionales ($1, $2, ...) compatibles con el driver
// `postgres` que usa el plugin.
//
// Cada repositorio que filtra rows venía implementando este patrón a mano
// (push a conditions[], push a params[], incrementar idx). Centralizar acá
// elimina la duplicación y garantiza que cualquier mejora futura (ej:
// cuoting de identificadores, params nombrados, NULL handling) se aplique
// a todos los repos sin tocarlos uno por uno.
//
// Diseño:
//   - Cada método ignora silenciosamente valores `undefined` para que el
//     caller pase directamente los filtros opcionales sin chequear.
//   - Casts a tipos PG explícitos via opción `{ cast: 'uuid' | 'timestamptz' }`
//     porque el driver postgres no infiere bien algunas conversiones (UUID,
//     timestamps, jsonb).
//   - `build()` devuelve `nextIdx` para que el caller siga numerando placeholders
//     después del WHERE (ej: LIMIT $N+1 OFFSET $N+2).

// bigint queda afuera adrede: el driver `postgres` no lo acepta como
// parámetro top-level. Si en algún momento se necesita, hay que pasarlo
// como string y castear server-side (ej: `$1::bigint`).
export type SqlValue = string | number | boolean | string[] | number[];

export interface BuildResult {
  /** Cláusula completa con `WHERE` al inicio, o cadena vacía si no hay condiciones. */
  whereClause: string;
  /** Valores en orden de los placeholders. */
  params: SqlValue[];
  /** Próximo índice de placeholder libre (para LIMIT/OFFSET, etc). */
  nextIdx: number;
}

/**
 * Tipos PG soportados por los casts del builder. Lista cerrada: si necesitás
 * uno nuevo, agregalo acá explícitamente — un string libre habilitaría typos
 * silenciosos que solo aparecen como errores de PG en runtime.
 */
export type SqlCast = 'uuid' | 'timestamptz' | 'timestamp' | 'jsonb' | 'bigint' | 'int';

interface CastOptions {
  /** Cast PG a aplicar al placeholder. */
  cast?: SqlCast;
}

export class WhereBuilder {
  private readonly conditions: string[] = [];
  private readonly params: SqlValue[] = [];
  private idx = 1;

  /** Agrega `column = $idx`. Skip si `value` es undefined o cadena vacía. */
  eq(column: string, value: SqlValue | undefined, options: CastOptions = {}): this {
    if (this.skip(value)) return this;
    const cast = options.cast ? `::${options.cast}` : '';
    this.conditions.push(`${column} = $${this.idx++}${cast}`);
    this.params.push(value);
    return this;
  }

  /** Agrega `column ILIKE $idx` con valor wrapeado en `%...%`. */
  ilike(column: string, value: string | undefined): this {
    if (this.skip(value)) return this;
    this.conditions.push(`${column} ILIKE $${this.idx++}`);
    this.params.push(`%${value}%`);
    return this;
  }

  /** Agrega `column >= $idx`. */
  gte(column: string, value: SqlValue | undefined, options: CastOptions = {}): this {
    if (this.skip(value)) return this;
    const cast = options.cast ? `::${options.cast}` : '';
    this.conditions.push(`${column} >= $${this.idx++}${cast}`);
    this.params.push(value);
    return this;
  }

  /** Agrega `column <= $idx`. */
  lte(column: string, value: SqlValue | undefined, options: CastOptions = {}): this {
    if (this.skip(value)) return this;
    const cast = options.cast ? `::${options.cast}` : '';
    this.conditions.push(`${column} <= $${this.idx++}${cast}`);
    this.params.push(value);
    return this;
  }

  /**
   * Agrega `column IN ($a, $b, ...)`. Skip si la lista es vacía o undefined.
   * Para listas grandes, considerar `inAny()` que usa un único array param.
   */
  inList(column: string, values: SqlValue[] | undefined): this {
    if (!values || values.length === 0) return this;
    const placeholders = values.map(() => `$${this.idx++}`).join(', ');
    this.conditions.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    return this;
  }

  /** Variante eficiente para listas grandes: `column = ANY($idx::tipo[])`. */
  inAny(column: string, values: string[] | undefined, arrayCast: string): this {
    if (!values || values.length === 0) return this;
    this.conditions.push(`${column} = ANY($${this.idx++}::${arrayCast}[])`);
    this.params.push(values);
    return this;
  }

  /** Agrega `column IS NOT NULL` incondicionalmente. Útil para filtros booleanos del contrato. */
  isNotNull(column: string): this {
    this.conditions.push(`${column} IS NOT NULL`);
    return this;
  }

  build(): BuildResult {
    return {
      whereClause: this.conditions.length === 0 ? '' : `WHERE ${this.conditions.join(' AND ')}`,
      params: [...this.params],
      nextIdx: this.idx,
    };
  }

  private skip(value: SqlValue | undefined): boolean {
    return value === undefined || value === null || value === '';
  }
}

/** Atajo para `new WhereBuilder()` que lee fluido en los call-sites. */
export function where(): WhereBuilder {
  return new WhereBuilder();
}
