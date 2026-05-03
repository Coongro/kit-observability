import { describe, expect, it } from 'vitest';
import { normalizeMessage } from './normalize-message.js';

describe('normalizeMessage', () => {
  it('reemplaza UUIDs con <uuid>', () => {
    const input = 'tenant 7a3f9b21-1234-5678-9abc-def012345678 not found';
    expect(normalizeMessage(input)).toBe('tenant <uuid> not found');
  });

  it('reemplaza IPs IPv4 con <ip>', () => {
    expect(normalizeMessage('connection from 192.168.1.42 dropped')).toBe(
      'connection from <ip> dropped'
    );
  });

  it('reemplaza valores hex (0x...) con <hex>', () => {
    expect(normalizeMessage('error at 0xdeadbeef and 0xCAFE')).toBe('error at <hex> and <hex>');
  });

  it('reemplaza números standalone con <num>', () => {
    expect(normalizeMessage('retry 5 of 10 after 200ms')).toBe(
      'retry <num> of <num> after <num>ms'
    );
  });

  it('procesa UUIDs antes que números (sin dejar dígitos sueltos)', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-111122223333';
    expect(normalizeMessage(`id=${uuid}`)).toBe('id=<uuid>');
  });

  it('procesa IPs antes que números (no rompe la IP en 4 <num>)', () => {
    expect(normalizeMessage('host 10.0.0.1 timeout')).toBe('host <ip> timeout');
  });

  it('mensajes idénticos a nivel literal devuelven idéntico output', () => {
    const a = normalizeMessage('failed to load tenant abc');
    const b = normalizeMessage('failed to load tenant abc');
    expect(a).toBe(b);
  });

  it('mensajes que difieren solo en valores dinámicos colapsan al mismo output', () => {
    const a = normalizeMessage(
      'tenant 11111111-2222-3333-4444-555555555555 has 12 records'
    );
    const b = normalizeMessage(
      'tenant aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee has 999 records'
    );
    expect(a).toBe(b);
    expect(a).toBe('tenant <uuid> has <num> records');
  });

  it('preserva mensajes sin dinámicas tal cual', () => {
    expect(normalizeMessage('plugin not found')).toBe('plugin not found');
  });

  it('mensaje vacío devuelve vacío', () => {
    expect(normalizeMessage('')).toBe('');
  });
});
