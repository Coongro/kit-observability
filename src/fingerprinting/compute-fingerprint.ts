import { createHash } from 'node:crypto';
import { normalizeMessage } from './normalize-message.js';

export interface ComputeFingerprintInput {
  level: number | string;
  source: string;
  message: string;
  topFrame?: string | null;
}

/**
 * Computa el fingerprint de un evento de log al estilo Sentry:
 * `sha1(level | source | normalize(message) | top_frame)`.
 *
 * Función pura — no toca DB, no consulta nada. Misma input ⇒ mismo output.
 * El testing es trivial.
 */
export function computeFingerprint(input: ComputeFingerprintInput): string {
  const normalized = normalizeMessage(input.message);
  const top = input.topFrame ?? '';
  const data = `${input.level}|${input.source}|${normalized}|${top}`;
  return createHash('sha1').update(data).digest('hex');
}
