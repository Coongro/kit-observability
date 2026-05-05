// Mapeo verb (último segmento de la action) → color del badge en la
// tabla de Auditoría. Vive separado del row component para que pueda
// crecer (más verbos, override por action específica) sin agrandar el
// componente.

export interface VerbColors {
  bg: string;
  fg: string;
}

const NEUTRAL: VerbColors = {
  bg: 'var(--neutral-200)',
  fg: 'var(--neutral-700)',
};

/**
 * Convención: verbos destructivos en rojo, creativos en teal,
 * modificatorios en gold. El último segmento de la action (después del
 * último `.`) determina el verbo, así `issue.status_updated` cae en
 * `updated` y mapea a gold.
 */
const VERB_COLORS: Record<string, VerbColors> = {
  // destructivo
  delete: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  cancel: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  revoke: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  suspend: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  fail: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  // creativo
  create: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  emit: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  open: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  deploy: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  invite: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  // modificatorio
  update: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  updated: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  set: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  assign: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  flag: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  status_updated: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
};

/**
 * Devuelve los colores del badge para una `action`. El verbo es el último
 * segmento; si no aparece en la tabla, se usa neutral.
 */
export function getActionVerbColors(action: string): VerbColors {
  const verb = action.split('.').pop() ?? '';
  return VERB_COLORS[verb] ?? NEUTRAL;
}
