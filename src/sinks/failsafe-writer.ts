import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Contrato del writer de fail-safe — interfaz pequeña para que SinkBase
 * dependa de algo testeable (un mock implementa esto sin tocar disco).
 */
export interface FailsafeWriter {
  write(line: string): void;
  close(): void;
}

/**
 * Implementación file-system con rotación por tamaño.
 *
 * Escritura sincrónica intencional: el fail-safe ya es el path de error,
 * usar fs.appendFile async + queue agrega complejidad y modos de fallo
 * extra justo cuando NO los queremos.
 *
 * Layout:
 *   <dir>/failsafe.jsonl     ← archivo activo
 *   <dir>/failsafe.1.jsonl   ← rotado (más reciente)
 *   <dir>/failsafe.2.jsonl
 *   ...
 *   <dir>/failsafe.{maxFiles-1}.jsonl  ← rotado (más viejo, se borra al rotar)
 */
export class FileFailsafeWriter implements FailsafeWriter {
  private readonly dir: string;
  private readonly maxFileBytes: number;
  private readonly maxFiles: number;
  private readonly currentFile: string;
  private currentSize: number;

  constructor(dir: string, maxFileBytes: number, maxFiles: number) {
    if (maxFiles < 1) {
      throw new Error(`[kit-observability] FileFailsafeWriter: maxFiles must be >= 1, got ${maxFiles}`);
    }
    this.dir = dir;
    this.maxFileBytes = maxFileBytes;
    this.maxFiles = maxFiles;
    fs.mkdirSync(dir, { recursive: true });
    this.currentFile = path.join(dir, 'failsafe.jsonl');
    this.currentSize = fs.existsSync(this.currentFile) ? fs.statSync(this.currentFile).size : 0;
  }

  write(line: string): void {
    const data = line.endsWith('\n') ? line : line + '\n';
    const size = Buffer.byteLength(data, 'utf8');
    if (this.currentSize + size > this.maxFileBytes && this.currentSize > 0) {
      this.rotate();
    }
    fs.appendFileSync(this.currentFile, data);
    this.currentSize += size;
  }

  close(): void {
    // No-op para writer sincrónico; existe para satisfacer el contrato.
  }

  private rotate(): void {
    // 1. drop oldest si excede maxFiles (failsafe.{maxFiles-1}.jsonl)
    const oldest = path.join(this.dir, `failsafe.${this.maxFiles - 1}.jsonl`);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }
    // 2. shift: failsafe.N.jsonl → failsafe.N+1.jsonl
    for (let i = this.maxFiles - 2; i >= 1; i--) {
      const src = path.join(this.dir, `failsafe.${i}.jsonl`);
      const dst = path.join(this.dir, `failsafe.${i + 1}.jsonl`);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }
    // 3. current → failsafe.1.jsonl
    if (fs.existsSync(this.currentFile)) {
      fs.renameSync(this.currentFile, path.join(this.dir, 'failsafe.1.jsonl'));
    }
    this.currentSize = 0;
  }
}
