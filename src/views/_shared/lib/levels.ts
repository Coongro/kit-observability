// Mapeo entre el LogLevel numérico del backend (core-logging) y los labels +
// colores que usan los views. Centralizado para que cualquier badge/filter/
// sparkline tenga la misma representación visual de cada nivel.

export const LEVEL = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
} as const;

export type LevelValue = (typeof LEVEL)[keyof typeof LEVEL];

export const LEVEL_LABEL: Record<LevelValue, string> = {
  [LEVEL.DEBUG]: 'debug',
  [LEVEL.INFO]: 'info',
  [LEVEL.WARN]: 'warn',
  [LEVEL.ERROR]: 'error',
  [LEVEL.FATAL]: 'fatal',
};

export interface LevelColors {
  /** Background del badge soft. */
  bg: string;
  /** Foreground del badge (texto). */
  fg: string;
  /** Color sólido del dot a la izquierda del label. */
  dot: string;
  /** Color del trazo de gráficos (sparkline, timeline). */
  stroke: string;
}

/**
 * Tokens del design system locales del plugin (definidos en
 * src/styles/observability.css). Los warn/error usan los colores semánticos
 * del system; debug usa la paleta sky decorativa para diferenciarse de info.
 */
export const LEVEL_COLORS: Record<LevelValue, LevelColors> = {
  [LEVEL.DEBUG]: {
    bg: 'var(--sky-soft)',
    fg: 'var(--sky-deep)',
    dot: 'var(--sky-dk)',
    stroke: 'var(--sky-dk)',
  },
  [LEVEL.INFO]: {
    bg: 'var(--teal-soft)',
    fg: 'var(--teal-deep)',
    dot: 'var(--teal-dk)',
    stroke: 'var(--teal-dk)',
  },
  [LEVEL.WARN]: {
    bg: 'var(--gold-soft)',
    fg: 'var(--gold-deep)',
    dot: 'var(--gold-dk)',
    stroke: 'var(--gold-dk)',
  },
  [LEVEL.ERROR]: {
    bg: 'var(--red-soft)',
    fg: 'var(--red-deep)',
    dot: 'var(--red)',
    stroke: 'var(--red)',
  },
  [LEVEL.FATAL]: {
    bg: 'var(--red)',
    fg: 'var(--white)',
    dot: 'var(--red-soft)',
    stroke: 'var(--red)',
  },
};

const FALLBACK: LevelColors = {
  bg: 'var(--neutral-200)',
  fg: 'var(--neutral-700)',
  dot: 'var(--neutral-500)',
  stroke: 'var(--neutral-500)',
};

/**
 * Devuelve los colores del nivel, con fallback neutral si el número no
 * matchea con ninguno conocido. No tiramos error porque el wire type viene
 * del backend y un nivel desconocido (ej: nuevo TRACE=5) no debería romper
 * la UI — solo renderizarse en gris.
 */
export function getLevelColors(level: number): LevelColors {
  return LEVEL_COLORS[level as LevelValue] ?? FALLBACK;
}

export function getLevelLabel(level: number): string {
  return LEVEL_LABEL[level as LevelValue] ?? `lvl${level}`;
}

/** True para warn/error/fatal (severities relevantes en filtros). */
export function isElevated(level: number): boolean {
  return level >= LEVEL.WARN;
}
