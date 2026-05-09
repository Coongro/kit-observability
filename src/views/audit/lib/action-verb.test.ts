import { describe, expect, it } from 'vitest';

import { classifyAction, getActionVerbColors, getVerbColorsIfMeaningful } from './action-verb.js';

describe('classifyAction', () => {
  // --- destructive ---
  it.each([
    ['plugin.uninstalled', 'modifier'], // uninstall es modificatorio (cambio reversible)
    ['plugin.action.failed', 'destructive'],
    ['cron.handler_failed', 'destructive'],
    ['auth.token_issue_failed', 'destructive'],
    ['tenant.soft_deleted', 'destructive'],
    ['tenant.hard_deleted', 'destructive'],
    ['user.suspend', 'destructive'],
    ['session.revoked', 'destructive'],
    ['payment.canceled', 'destructive'],
  ])('%s → %s', (action, expected) => {
    expect(classifyAction(action)).toBe(expected);
  });

  // --- creative ---
  it.each([
    ['tenant.created', 'creative'],
    ['plugin.installed', 'creative'],
    ['plugin.activated', 'creative'],
    ['auth.token_issued', 'creative'],
    ['plugin.action.executed', 'creative'],
    ['user.invited', 'creative'],
    ['issue.opened', 'creative'],
  ])('%s → %s', (action, expected) => {
    expect(classifyAction(action)).toBe(expected);
  });

  // --- modifier ---
  it.each([
    ['tenant.updated', 'modifier'],
    ['plugin.updated', 'modifier'],
    ['plugin.deactivated', 'modifier'],
    ['issue.status_updated', 'modifier'],
    ['user.role_assigned', 'modifier'],
    ['feature.flag_set', 'modifier'],
  ])('%s → %s', (action, expected) => {
    expect(classifyAction(action)).toBe(expected);
  });

  it('action vacía o sin verbo → neutral', () => {
    expect(classifyAction('')).toBe('neutral');
    expect(classifyAction('foo.bar.baz')).toBe('neutral');
  });

  it('override explícito de plugin.operation_failed → destructive', () => {
    expect(classifyAction('plugin.operation_failed')).toBe('destructive');
  });

  it('case insensitive (las actions del core a veces vienen con mayúsculas)', () => {
    expect(classifyAction('Tenant.Created')).toBe('creative');
    expect(classifyAction('USER.SUSPENDED')).toBe('destructive');
  });
});

describe('getActionVerbColors', () => {
  it('destructive devuelve red palette', () => {
    const c = getActionVerbColors('tenant.hard_deleted');
    expect(c.bg).toBe('var(--red-soft)');
    expect(c.fg).toBe('var(--red-deep)');
  });

  it('neutral devuelve neutral palette para actions desconocidas', () => {
    const c = getActionVerbColors('something.weird');
    expect(c.bg).toBe('var(--neutral-200)');
    expect(c.fg).toBe('var(--neutral-700)');
  });
});

describe('getVerbColorsIfMeaningful', () => {
  it('entityIds tipo "modulo.entidad.verbo" (auto-wired repos) detectan el verbo del último segmento', () => {
    expect(getVerbColorsIfMeaningful('calendar.events.create')).toMatchObject({
      bg: 'var(--teal-soft)',
    });
    expect(getVerbColorsIfMeaningful('appointments.update')).toMatchObject({
      bg: 'var(--gold-soft)',
    });
    expect(getVerbColorsIfMeaningful('patients.delete')).toMatchObject({
      bg: 'var(--red-soft)',
    });
  });

  it('targets sin verbo identificable devuelven null (caller mantiene neutral default)', () => {
    expect(getVerbColorsIfMeaningful('plugin_action')).toBeNull();
    expect(getVerbColorsIfMeaningful('user:123')).toBeNull();
    expect(getVerbColorsIfMeaningful('something.weird')).toBeNull();
    expect(getVerbColorsIfMeaningful('')).toBeNull();
  });

  it('mantiene el override del action específico (plugin.operation_failed)', () => {
    expect(getVerbColorsIfMeaningful('plugin.operation_failed')).toMatchObject({
      bg: 'var(--red-soft)',
    });
  });
});
