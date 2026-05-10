import { describe, expect, it, vi } from 'vitest';

import { bucketCountByFingerprint, countDistinctTenantsByFingerprint } from './aggregates.js';

/**
 * Tests del bucket-index math y los runtime guards de SQL injection. La
 * SQL real no se ejecuta — mockeamos `raw.unsafe<>(...)` para inspeccionar
 * qué se envió y qué se devolvió. Cubre dos regresiones encontradas en dev:
 *
 *   1. `INTERVAL '24 1 hour'` (sintaxis inválida): pasaba cuando se
 *      concatenaba `bucketCount` + un literal "1 hour" del diccionario.
 *      Hoy se interpola solo `${bucketCount} ${granularity}` (singular).
 *   2. `row.bucket_at.getTime is not a function`: el driver postgres
 *      devolvía `timestamp` (sin TZ) como string. El cast a `timestamptz`
 *      garantiza Date — pero el código mantiene un fallback defensivo.
 */
describe('bucketCountByFingerprint', () => {
  function fakeSql(rows: unknown[]) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const fn = vi.fn((sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve(rows);
    });
    return { raw: { unsafe: fn } as never, calls };
  }

  describe('runtime guards (SQL injection surface)', () => {
    it('rechaza granularidades fuera del allowlist', async () => {
      const { raw } = fakeSql([]);
      await expect(
        bucketCountByFingerprint(raw, {
          fingerprints: ['fp1'],
          // SQL injection attempt si granularity llegara desde un query
          // param: `'minute'); DROP TABLE log_entries; --`
          granularity: "minute'); DROP TABLE log_entries; --" as never,
          bucketCount: 24,
        })
      ).rejects.toThrow(/Invalid granularity/);
    });

    it('rechaza bucketCount no positivo', async () => {
      const { raw } = fakeSql([]);
      await expect(
        bucketCountByFingerprint(raw, {
          fingerprints: ['fp1'],
          granularity: 'hour',
          bucketCount: 0,
        })
      ).rejects.toThrow(/positive integer/);
    });

    it('rechaza bucketCount no entero (defensa contra "24; DROP …")', async () => {
      const { raw } = fakeSql([]);
      await expect(
        bucketCountByFingerprint(raw, {
          fingerprints: ['fp1'],
          granularity: 'hour',
          bucketCount: 24.5 as never,
        })
      ).rejects.toThrow(/positive integer/);
    });
  });

  describe('shape del SQL', () => {
    it('emite INTERVAL con el unit singular sin duplicar el "1" (regresión COONG-118)', async () => {
      const { raw, calls } = fakeSql([]);
      await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(calls[0].sql).toContain("INTERVAL '24 hour'");
      // Guardia explícita contra el bug viejo: nunca debe aparecer
      // `INTERVAL '24 1 hour'` ni similares con número duplicado.
      expect(calls[0].sql).not.toMatch(/INTERVAL\s+'\d+\s+\d+/);
    });

    it('castea bucket_at a timestamptz para que el driver devuelva Date', async () => {
      const { raw, calls } = fakeSql([]);
      await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(calls[0].sql).toMatch(/date_trunc\('hour', timestamp\)::timestamptz/);
    });
  });

  describe('input vacío', () => {
    it('no consulta la DB cuando no hay fingerprints', async () => {
      const { raw, calls } = fakeSql([]);
      const result = await bucketCountByFingerprint(raw, {
        fingerprints: [],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(calls).toHaveLength(0);
      expect(result.size).toBe(0);
    });
  });

  describe('bucket-index math', () => {
    it('rellena con ceros las posiciones sin eventos', async () => {
      const { raw } = fakeSql([]);
      const result = await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(result.get('fp1')).toEqual(new Array<number>(24).fill(0));
    });

    it('coloca el bucket "ahora" en el último índice (newest first-array-last)', async () => {
      // Mockeamos un único bucket exactamente en la hora actual.
      const nowHour = new Date();
      nowHour.setMilliseconds(0);
      nowHour.setSeconds(0);
      nowHour.setMinutes(0);
      const { raw } = fakeSql([{ fingerprint: 'fp1', bucket_at: nowHour, cnt: '7' }]);
      const result = await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      const arr = result.get('fp1');
      expect(arr?.[23]).toBe(7); // último índice = "ahora"
      expect(arr?.[0]).toBe(0); // hace 23 horas, sin eventos
    });

    it('acepta bucket_at como string ISO (defensa contra drift de driver)', async () => {
      // Repro del bug viejo: si por algún motivo el driver vuelve a
      // devolver string en lugar de Date, el código sigue funcionando.
      const nowHour = new Date();
      nowHour.setMilliseconds(0);
      nowHour.setSeconds(0);
      nowHour.setMinutes(0);
      const { raw } = fakeSql([{ fingerprint: 'fp1', bucket_at: nowHour.toISOString(), cnt: '3' }]);
      const result = await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(result.get('fp1')?.[23]).toBe(3);
    });

    it('descarta buckets fuera del rango (>= bucketCount horas atrás)', async () => {
      // Si la DB devuelve un bucket de hace 100h, no debe romper ni meterse
      // en el array de 24 posiciones.
      const ancient = new Date();
      ancient.setHours(ancient.getHours() - 100);
      ancient.setMilliseconds(0);
      ancient.setSeconds(0);
      ancient.setMinutes(0);
      const { raw } = fakeSql([{ fingerprint: 'fp1', bucket_at: ancient, cnt: '999' }]);
      const result = await bucketCountByFingerprint(raw, {
        fingerprints: ['fp1'],
        granularity: 'hour',
        bucketCount: 24,
      });
      expect(result.get('fp1')).toEqual(new Array<number>(24).fill(0));
    });
  });
});

describe('countDistinctTenantsByFingerprint', () => {
  it('no consulta cuando la lista es vacía', async () => {
    const calls: unknown[] = [];
    const raw = {
      unsafe: vi.fn((sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return Promise.resolve([]);
      }),
    } as never;
    const result = await countDistinctTenantsByFingerprint(raw, []);
    expect(calls).toHaveLength(0);
    expect(result.size).toBe(0);
  });

  it('parsea el count bigint string a number', async () => {
    const raw = {
      unsafe: vi.fn(() => Promise.resolve([{ fingerprint: 'fp1', tenants: '5' }])),
    } as never;
    const result = await countDistinctTenantsByFingerprint(raw, ['fp1']);
    expect(result.get('fp1')).toBe(5);
  });
});
