// Mapeo verb (último segmento de la action) → color del badge en la
// tabla de Auditoría. Vive separado del row component para que pueda
// crecer (más verbos, override por action específica) sin agrandar el
// componente.

export interface VerbColors {
  bg: string;
  fg: string;
}

export type VerbCategory = 'destructive' | 'creative' | 'modifier' | 'neutral';

const PALETTE: Record<VerbCategory, VerbColors> = {
  destructive: { bg: 'var(--red-soft)', fg: 'var(--red-deep)' },
  creative: { bg: 'var(--teal-soft)', fg: 'var(--teal-deep)' },
  modifier: { bg: 'var(--gold-soft)', fg: 'var(--gold-deep)' },
  neutral: { bg: 'var(--neutral-200)', fg: 'var(--neutral-700)' },
};

/**
 * Keywords que clasifican un verbo en una categoría visual. Match por
 * substring sobre el último segmento de la action (después del último `.`):
 * cubre formas conjugadas (`deleted`, `created`), compuestas
 * (`soft_deleted`, `token_issued`, `operation_failed`, `handler_failed`),
 * y sufijos (`_failed`, `_completed`).
 *
 * Orden importa: la primera categoría que matchea gana. Tres reglas:
 *   1. **destructive** primero — `_failed` cae rojo aunque la action
 *      empiece con un verbo de otra clase (ej. `auth.token_issue_failed`).
 *   2. **modifier** antes que creative — los inversos negativos
 *      (`uninstall`, `deactivat`) son substrings que CONTIENEN al verbo
 *      creative correspondiente (`install`, `activat`). Si chequeamos
 *      creative primero, `plugin.uninstalled` matchearía `install` y se
 *      pintaría como creación. Modifier-first invierte la prioridad.
 *   3. **creative** al final — captura los verbos puros que no son
 *      negativos (`install`, `activat`, `create`, etc.).
 *
 * Agregar verbos nuevos: sumar a la lista de la categoría correcta. Si una
 * action específica necesita color diferente al que su verbo sugiere
 * (ej: `system.maintenance` querés en azul), agregá un override en
 * `ACTION_OVERRIDES` abajo en vez de pelear con la heurística.
 */
const VERB_KEYWORDS: Array<{ category: VerbCategory; keywords: readonly string[] }> = [
  // 1. destructivo: borrado, fallo, revocación, suspensión
  {
    category: 'destructive',
    keywords: ['delete', 'cancel', 'revoke', 'suspend', 'fail', 'reject', 'expire', 'block'],
  },
  // 2. modificatorio: update, set, assign, flag, + inversos de creative
  //    (uninstall, deactivat) que tienen que matchear ANTES que sus
  //    contrapartes creative para no clasificarse como creación.
  {
    category: 'modifier',
    keywords: [
      'update',
      'set',
      'assign',
      'flag',
      'modif',
      'rename',
      'patch',
      'uninstall',
      'deactivat',
      'unblock',
    ],
  },
  // 3. creativo: creación, emisión, deploy, activación
  {
    category: 'creative',
    keywords: [
      'create',
      'emit',
      'open',
      'deploy',
      'invite',
      'install',
      'activat',
      'issued',
      'register',
      'execut',
    ],
  },
];

/**
 * Overrides explícitos por action completa, evaluados ANTES de la heurística
 * de keywords. Para acciones que no encajan en la regla del último segmento
 * o que querés rebajar/elevar visualmente.
 */
const ACTION_OVERRIDES: Record<string, VerbCategory> = {
  // Actions que la heurística clasificaría mal o ambiguamente:
  'plugin.operation_failed': 'destructive', // contiene 'operation_' que no matchea, pero termina en 'failed'
};

/**
 * Devuelve los colores del badge para una `action`. El verbo es el último
 * segmento; si no aparece en ninguna categoría, se usa neutral.
 */
export function getActionVerbColors(action: string): VerbColors {
  return PALETTE[classifyAction(action)];
}

/**
 * Clasifica una action en una categoría visual. Exportado para tests y
 * para callers que quieran agrupar/contar por categoría sin volver a
 * recalcular paletas.
 */
export function classifyAction(action: string): VerbCategory {
  const override = ACTION_OVERRIDES[action];
  if (override) return override;
  const verb = (action.split('.').pop() ?? '').toLowerCase();
  if (!verb) return 'neutral';
  for (const { category, keywords } of VERB_KEYWORDS) {
    for (const keyword of keywords) {
      if (verb.includes(keyword)) return category;
    }
  }
  return 'neutral';
}
