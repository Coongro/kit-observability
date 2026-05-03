import { describe, expect, it } from 'vitest';

import { preAggregate } from './aggregator.js';

describe('preAggregate', () => {
  it('inputs vacios devuelve []', () => {
    expect(preAggregate([])).toEqual([]);
  });

  it('inputs con fingerprints únicos devuelve 1 row por fingerprint con count=1', () => {
    const result = preAggregate([
      base({ fingerprint: 'a', sampleMessage: 'msg-a' }),
      base({ fingerprint: 'b', sampleMessage: 'msg-b' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => ({ fp: r.fingerprint, count: r.count }))).toEqual([
      { fp: 'a', count: 1 },
      { fp: 'b', count: 1 },
    ]);
  });

  it('inputs repetidos suman count en el output', () => {
    const result = preAggregate([
      base({ fingerprint: 'a' }),
      base({ fingerprint: 'a' }),
      base({ fingerprint: 'a' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.count).toBe(3);
  });

  it('mantiene el sample message más reciente cuando hay duplicados', () => {
    const result = preAggregate([
      base({ fingerprint: 'a', sampleMessage: 'first' }),
      base({ fingerprint: 'a', sampleMessage: 'second' }),
      base({ fingerprint: 'a', sampleMessage: 'last' }),
    ]);
    expect(result[0]?.sampleMessage).toBe('last');
  });

  it('mantiene el sample top frame más reciente cuando hay duplicados', () => {
    const result = preAggregate([
      base({ fingerprint: 'a', sampleTopFrame: 'frame-1' }),
      base({ fingerprint: 'a', sampleTopFrame: 'frame-2' }),
    ]);
    expect(result[0]?.sampleTopFrame).toBe('frame-2');
  });

  it('mix de fingerprints — agrupa solo los repetidos', () => {
    const result = preAggregate([
      base({ fingerprint: 'a' }),
      base({ fingerprint: 'b' }),
      base({ fingerprint: 'a' }),
      base({ fingerprint: 'c' }),
      base({ fingerprint: 'a' }),
    ]);
    const byFp = new Map(result.map((r) => [r.fingerprint, r.count]));
    expect(byFp.get('a')).toBe(3);
    expect(byFp.get('b')).toBe(1);
    expect(byFp.get('c')).toBe(1);
  });
});

function base(
  overrides: Partial<Parameters<typeof preAggregate>[0][number]> & { fingerprint: string }
) {
  return {
    fingerprint: overrides.fingerprint,
    level: 40,
    source: 'app',
    sampleMessage: overrides.sampleMessage ?? 'msg',
    sampleTopFrame: overrides.sampleTopFrame ?? null,
    tenantId: overrides.tenantId ?? null,
  };
}
