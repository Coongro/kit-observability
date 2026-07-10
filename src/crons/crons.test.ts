import { describe, expect, it, vi } from 'vitest';

// El camino no-op no instancia PartitionManager, pero maintenance.ts lo importa
// a nivel de módulo. Stub para no depender de la resolución del workspace dep.
vi.mock('@coongro/database-core', () => ({
  PartitionManager: vi.fn(),
}));

vi.mock('../runtime/state.js', () => ({
  getRuntimeStateOrNull: vi.fn(),
}));

import { getRuntimeStateOrNull } from '../runtime/state.js';

import { runMaintenance } from './maintenance.js';
import { runRetention } from './retention.js';

/**
 * No-op de los crons cuando el plugin está inactivo (OBSERVABILITY_DISABLED=1 o
 * activate() aún no corrió). NO necesita DB. Sin esto los handlers tiraban
 * (getRuntimeState lanza) y el cron loader registraba un error cada hora.
 * Ver COONG-226 y crons.integration.test.ts para el camino con DB.
 */
describe('crons — no-op cuando el plugin está inactivo (COONG-226)', () => {
  it('runMaintenance retorna sin tocar la DB si no hay runtime state', async () => {
    vi.mocked(getRuntimeStateOrNull).mockReturnValue(null);
    const logger = { info: vi.fn() };

    await expect(runMaintenance({ logger })).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('inactivo'));
  });

  it('runRetention retorna sin tocar la DB si no hay runtime state', async () => {
    vi.mocked(getRuntimeStateOrNull).mockReturnValue(null);
    const logger = { info: vi.fn() };

    await expect(runRetention({ logger })).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('inactivo'));
  });
});
