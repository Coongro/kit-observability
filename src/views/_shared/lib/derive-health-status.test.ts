import { describe, expect, it } from 'vitest';

import type { SinkHealth } from '../api.js';

import {
  deriveFailsafeStatus,
  deriveGlobalReason,
  deriveGlobalStatus,
  deriveInsertErrorsStatus,
  deriveQueueLagStatus,
} from './derive-health-status.js';

const HEALTHY: SinkHealth = {
  queueLag: 0,
  insertFailures: 0,
  lastFlushAt: '2026-05-05T00:00:00.000Z',
  divertedToFailsafe: 0,
  permanentlyLost: 0,
  failsafeWriteErrors: 0,
};

describe('deriveQueueLagStatus', () => {
  it('returns ok under threshold', () => {
    expect(deriveQueueLagStatus(0)).toBe('ok');
    expect(deriveQueueLagStatus(49)).toBe('ok');
  });

  it('returns warn at or above threshold', () => {
    expect(deriveQueueLagStatus(50)).toBe('warn');
    expect(deriveQueueLagStatus(500)).toBe('warn');
  });
});

describe('deriveFailsafeStatus', () => {
  it('returns ok with no diverts and no losses', () => {
    expect(deriveFailsafeStatus(HEALTHY)).toBe('ok');
  });

  it('returns warn when DB bounced but failsafe caught it', () => {
    expect(deriveFailsafeStatus({ ...HEALTHY, divertedToFailsafe: 5 })).toBe('warn');
  });

  it('returns error when entries are permanently lost', () => {
    expect(deriveFailsafeStatus({ ...HEALTHY, permanentlyLost: 1 })).toBe('error');
  });

  it('returns error on failsafe write errors even without permanent loss', () => {
    expect(deriveFailsafeStatus({ ...HEALTHY, failsafeWriteErrors: 1 })).toBe('error');
  });
});

describe('deriveInsertErrorsStatus', () => {
  it('returns ok with zero failures', () => {
    expect(deriveInsertErrorsStatus(HEALTHY)).toBe('ok');
  });

  it('returns warn when the sink has recovered (lastFlushAt set)', () => {
    expect(deriveInsertErrorsStatus({ ...HEALTHY, insertFailures: 3 })).toBe('warn');
  });

  it('returns error when the sink has never flushed but already failed', () => {
    expect(deriveInsertErrorsStatus({ ...HEALTHY, insertFailures: 1, lastFlushAt: null })).toBe(
      'error'
    );
  });
});

describe('deriveGlobalStatus', () => {
  it('returns ok for an empty sink list', () => {
    expect(deriveGlobalStatus([])).toBe('ok');
  });

  it('returns ok when all sinks are healthy', () => {
    expect(deriveGlobalStatus([HEALTHY, HEALTHY])).toBe('ok');
  });

  it('returns warn when any sink has degraded but no permanent loss', () => {
    expect(deriveGlobalStatus([HEALTHY, { ...HEALTHY, divertedToFailsafe: 2 }])).toBe('warn');
  });

  it('returns error when any sink has permanent loss', () => {
    expect(
      deriveGlobalStatus([
        { ...HEALTHY, divertedToFailsafe: 2 },
        { ...HEALTHY, permanentlyLost: 1 },
      ])
    ).toBe('error');
  });
});

describe('deriveGlobalReason', () => {
  it('reports permanent loss first', () => {
    const reason = deriveGlobalReason([
      { name: 'dbSink', health: { ...HEALTHY, divertedToFailsafe: 10 } },
      { name: 'spanSink', health: { ...HEALTHY, permanentlyLost: 3 } },
    ]);
    expect(reason).toContain('spanSink');
    expect(reason).toContain('3 entries perdidas');
  });

  it('falls back to "all normal" when nothing is wrong', () => {
    const reason = deriveGlobalReason([
      { name: 'dbSink', health: HEALTHY },
      { name: 'spanSink', health: HEALTHY },
    ]);
    expect(reason).toMatch(/normal/);
  });

  it('reports queue lag when no failures present', () => {
    const reason = deriveGlobalReason([{ name: 'dbSink', health: { ...HEALTHY, queueLag: 120 } }]);
    expect(reason).toContain('queue lag de 120');
  });
});
