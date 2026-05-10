import { describe, expect, it } from 'vitest';

import { extractSearchToken } from './issue-search-token.js';

describe('extractSearchToken', () => {
  it('extrae bracket prefix cuando arranca con [Tag]', () => {
    expect(extractSearchToken('[TenantStateAudit] DRIFT DETECTED in 7 tenants')).toBe(
      '[TenantStateAudit]'
    );
  });

  it('preserva el bracket completo aunque tenga espacios internos', () => {
    expect(extractSearchToken('[Module Lifecycle] booting')).toBe('[Module Lifecycle]');
  });

  it('cae a primeras palabras hasta puntuación cuando no hay bracket', () => {
    // El mensaje completo se corta primero por el `.` y luego al MAX (24).
    expect(extractSearchToken('DRIFT DETECTED in 7 tenants. Manual remediation.')).toBe(
      'DRIFT DETECTED in 7 tena'
    );
  });

  it('cuando el segmento pre-puntuación cabe en MAX, lo devuelve completo', () => {
    expect(extractSearchToken('short head. and rest')).toBe('short head');
  });

  it('capa el fallback a MAX chars sin cortar palabras a medio', () => {
    const long = 'A'.repeat(100);
    const out = extractSearchToken(long);
    expect(out).not.toBeNull();
    expect((out ?? '').length).toBeLessThanOrEqual(24);
  });

  it('devuelve null para mensajes vacíos o whitespace', () => {
    expect(extractSearchToken('')).toBeNull();
    expect(extractSearchToken('   ')).toBeNull();
    expect(extractSearchToken(null)).toBeNull();
    expect(extractSearchToken(undefined)).toBeNull();
  });

  it('corta en newline', () => {
    expect(extractSearchToken('first line\nsecond line')).toBe('first line');
  });

  it('ignora bracket vacío y cae al fallback', () => {
    // Regex requiere contenido dentro del bracket.
    expect(extractSearchToken('[] foo bar')).toBe('[] foo bar');
  });
});
