import { describe, expect, it } from 'vitest';

import { where, WhereBuilder } from './sql-filters.js';

describe('WhereBuilder', () => {
  describe('builder vacío', () => {
    it('produce cláusula vacía y nextIdx = 1', () => {
      const { whereClause, params, nextIdx } = where().build();
      expect(whereClause).toBe('');
      expect(params).toEqual([]);
      expect(nextIdx).toBe(1);
    });
  });

  describe('eq', () => {
    it('agrega una condición simple', () => {
      const r = where().eq('level', 40).build();
      expect(r.whereClause).toBe('WHERE level = $1');
      expect(r.params).toEqual([40]);
      expect(r.nextIdx).toBe(2);
    });

    it('aplica el cast cuando se especifica', () => {
      const r = where().eq('tenant_id', 'abc', { cast: 'uuid' }).build();
      expect(r.whereClause).toBe('WHERE tenant_id = $1::uuid');
    });

    it('skip silencioso si el valor es undefined', () => {
      const r = where().eq('level', undefined).build();
      expect(r.whereClause).toBe('');
      expect(r.nextIdx).toBe(1);
    });

    it('skip silencioso si el valor es cadena vacía', () => {
      const r = where().eq('source', '').build();
      expect(r.whereClause).toBe('');
    });
  });

  describe('ilike', () => {
    it('wrappea el valor en %...% automáticamente', () => {
      const r = where().ilike('message', 'foo').build();
      expect(r.whereClause).toBe('WHERE message ILIKE $1');
      expect(r.params).toEqual(['%foo%']);
    });

    it('skip si el valor es undefined', () => {
      expect(where().ilike('message', undefined).build().whereClause).toBe('');
    });
  });

  describe('gte / lte', () => {
    it('aplica cast timestamptz a rangos de fecha', () => {
      const r = where()
        .gte('last_seen_at', '2026-01-01T00:00:00Z', { cast: 'timestamptz' })
        .lte('last_seen_at', '2026-12-31T00:00:00Z', { cast: 'timestamptz' })
        .build();
      expect(r.whereClause).toBe(
        'WHERE last_seen_at >= $1::timestamptz AND last_seen_at <= $2::timestamptz'
      );
      expect(r.params).toEqual(['2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z']);
    });
  });

  describe('inList', () => {
    it('genera placeholders por elemento', () => {
      const r = where().inList('status', ['open', 'muted']).build();
      expect(r.whereClause).toBe('WHERE status IN ($1, $2)');
      expect(r.params).toEqual(['open', 'muted']);
      expect(r.nextIdx).toBe(3);
    });

    it('skip si la lista es vacía (foot-gun: nunca emitir IN ())', () => {
      const r = where().inList('status', []).build();
      expect(r.whereClause).toBe('');
      expect(r.nextIdx).toBe(1);
    });

    it('skip si la lista es undefined', () => {
      expect(where().inList('status', undefined).build().whereClause).toBe('');
    });
  });

  describe('inAny', () => {
    it('usa ANY($N::tipo[]) para listas grandes', () => {
      const r = where().inAny('fingerprint', ['fp1', 'fp2'], 'text').build();
      expect(r.whereClause).toBe('WHERE fingerprint = ANY($1::text[])');
      expect(r.params).toEqual([['fp1', 'fp2']]);
      expect(r.nextIdx).toBe(2);
    });

    it('skip con lista vacía', () => {
      expect(where().inAny('fingerprint', [], 'text').build().whereClause).toBe('');
    });
  });

  describe('isNotNull', () => {
    it('agrega la condición sin consumir placeholder', () => {
      const r = where().isNotNull('tenant_id').build();
      expect(r.whereClause).toBe('WHERE tenant_id IS NOT NULL');
      expect(r.params).toEqual([]);
      expect(r.nextIdx).toBe(1);
    });
  });

  describe('chaining', () => {
    it('compone múltiples condiciones con AND y mantiene orden de placeholders', () => {
      const r = where()
        .eq('level', 40)
        .inList('status', ['open'])
        .eq('tenant_id', 'abc', { cast: 'uuid' })
        .ilike('sample_message', 'oops')
        .gte('last_seen_at', '2026-01-01T00:00:00Z', { cast: 'timestamptz' })
        .build();
      expect(r.whereClause).toBe(
        'WHERE level = $1 AND status IN ($2) AND tenant_id = $3::uuid AND sample_message ILIKE $4 AND last_seen_at >= $5::timestamptz'
      );
      expect(r.params).toEqual([40, 'open', 'abc', '%oops%', '2026-01-01T00:00:00Z']);
      expect(r.nextIdx).toBe(6);
    });

    it('los skip no consumen placeholders y nextIdx queda coherente para LIMIT/OFFSET', () => {
      const r = where()
        .eq('level', 40)
        .eq('source', undefined)
        .eq('tenant_id', undefined, { cast: 'uuid' })
        .build();
      expect(r.whereClause).toBe('WHERE level = $1');
      expect(r.params).toEqual([40]);
      expect(r.nextIdx).toBe(2);
      // El caller sigue numerando desde nextIdx — útil para regresar
      // contra reintroducción del bug "LIMIT $1 OFFSET $2" cuando ya hay
      // params consumidos en el WHERE.
    });
  });

  describe('immutability del array de params', () => {
    it('build() devuelve una copia — mutarla no afecta builds futuros', () => {
      const builder = new WhereBuilder().eq('level', 40);
      const a = builder.build();
      a.params.push('contaminated' as never);
      const b = builder.build();
      expect(b.params).toEqual([40]);
    });
  });
});
