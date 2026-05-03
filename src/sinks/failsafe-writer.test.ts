import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileFailsafeWriter } from './failsafe-writer.js';

describe('FileFailsafeWriter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('crea el directorio si no existe', () => {
    const dir = path.join(tmpDir, 'nested', 'deep');
    new FileFailsafeWriter(dir, 1024, 3);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('escribe líneas al archivo activo (failsafe.jsonl)', () => {
    const writer = new FileFailsafeWriter(tmpDir, 1024, 3);
    writer.write('{"a":1}');
    writer.write('{"b":2}');
    const content = fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8');
    expect(content).toBe('{"a":1}\n{"b":2}\n');
  });

  it('agrega newline si la línea no la trae', () => {
    const writer = new FileFailsafeWriter(tmpDir, 1024, 3);
    writer.write('no-newline');
    const content = fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8');
    expect(content).toBe('no-newline\n');
  });

  it('NO duplica newline si la línea ya lo trae', () => {
    const writer = new FileFailsafeWriter(tmpDir, 1024, 3);
    writer.write('with-newline\n');
    const content = fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8');
    expect(content).toBe('with-newline\n');
  });

  it('rota cuando excede maxFileBytes', () => {
    const writer = new FileFailsafeWriter(tmpDir, 20, 3);
    writer.write('aaaaaaaaaaaaaaaaaa'); // 18 bytes + \n = 19 bytes
    writer.write('b'); // ahora pasa el límite, debería rotar
    expect(fs.existsSync(path.join(tmpDir, 'failsafe.1.jsonl'))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, 'failsafe.1.jsonl'), 'utf8')).toBe(
      'aaaaaaaaaaaaaaaaaa\n'
    );
    expect(fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8')).toBe('b\n');
  });

  it('respeta maxFiles dropeando el más viejo', () => {
    const writer = new FileFailsafeWriter(tmpDir, 5, 3);
    writer.write('aaaa'); // 5 bytes (4 + \n) — no rota aún
    writer.write('bbbb'); // rota: aaaa → failsafe.1, current = bbbb
    writer.write('cccc'); // rota: bbbb → failsafe.1, aaaa → failsafe.2, current = cccc
    writer.write('dddd'); // rota: cccc → failsafe.1, bbbb → failsafe.2, aaaa SE DROPEA, current = dddd

    expect(fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8')).toBe('dddd\n');
    expect(fs.readFileSync(path.join(tmpDir, 'failsafe.1.jsonl'), 'utf8')).toBe('cccc\n');
    expect(fs.readFileSync(path.join(tmpDir, 'failsafe.2.jsonl'), 'utf8')).toBe('bbbb\n');
    // failsafe.3 NO debe existir (maxFiles=3 means failsafe + .1 + .2)
    expect(fs.existsSync(path.join(tmpDir, 'failsafe.3.jsonl'))).toBe(false);
  });

  it('si el archivo activo ya existe (re-init después de crash), sigue desde el size correcto', () => {
    fs.writeFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'pre-existing\n');
    const writer = new FileFailsafeWriter(tmpDir, 100, 3);
    writer.write('after-restart');
    const content = fs.readFileSync(path.join(tmpDir, 'failsafe.jsonl'), 'utf8');
    expect(content).toBe('pre-existing\nafter-restart\n');
  });

  it('throwa si maxFiles < 1', () => {
    expect(() => new FileFailsafeWriter(tmpDir, 1024, 0)).toThrow(/maxFiles/);
  });

  it('close() es no-op (idempotente)', () => {
    const writer = new FileFailsafeWriter(tmpDir, 1024, 3);
    writer.write('x');
    expect(() => {
      writer.close();
      writer.close();
    }).not.toThrow();
  });
});
