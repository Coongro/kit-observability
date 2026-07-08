import { LogLevel } from '@coongro/core-logging';
import { describe, expect, it } from 'vitest';

import { isObservabilityDisabled, loadConfig } from './config.js';

describe('loadConfig — dbMinLevel (COONG-202)', () => {
  it('default es WARN cuando no se setea la env (no persiste el ruido INFO del otel-bridge)', () => {
    expect(loadConfig({}).dbMinLevel).toBe(LogLevel.WARN);
  });

  it('parsea el nivel desde env (case-insensitive)', () => {
    expect(loadConfig({ OBSERVABILITY_DB_MIN_LEVEL: 'info' }).dbMinLevel).toBe(LogLevel.INFO);
    expect(loadConfig({ OBSERVABILITY_DB_MIN_LEVEL: 'ERROR' }).dbMinLevel).toBe(LogLevel.ERROR);
    expect(loadConfig({ OBSERVABILITY_DB_MIN_LEVEL: ' Debug ' }).dbMinLevel).toBe(LogLevel.DEBUG);
  });

  it('lanza ante un valor desconocido (un typo no debe degradar la observabilidad en silencio)', () => {
    expect(() => loadConfig({ OBSERVABILITY_DB_MIN_LEVEL: 'verbose' })).toThrow(
      /OBSERVABILITY_DB_MIN_LEVEL/
    );
  });
});

describe('isObservabilityDisabled — master kill-switch (COONG-226)', () => {
  it('false por defecto cuando la env no está seteada (plugin activo)', () => {
    expect(isObservabilityDisabled({})).toBe(false);
  });

  it('true SOLO con el valor exacto "1"', () => {
    expect(isObservabilityDisabled({ OBSERVABILITY_DISABLED: '1' })).toBe(true);
  });

  it('false ante valores truthy que no son "1" (evita apagados accidentales por typo)', () => {
    expect(isObservabilityDisabled({ OBSERVABILITY_DISABLED: 'true' })).toBe(false);
    expect(isObservabilityDisabled({ OBSERVABILITY_DISABLED: 'yes' })).toBe(false);
    expect(isObservabilityDisabled({ OBSERVABILITY_DISABLED: '0' })).toBe(false);
    expect(isObservabilityDisabled({ OBSERVABILITY_DISABLED: '' })).toBe(false);
  });
});
