// Constantes compartidas entre el header del waterfall y las filas. La
// columna del árbol tiene que coincidir pixel-perfect entre el sticky
// header y cada SpanRow para que los ticks del eje queden alineados con
// las barras — definirla en un solo lugar evita drifts visuales.

export const WATERFALL_TREE_COL_WIDTH = 280;
export const WATERFALL_DEPTH_INDENT = 14;
/** Cantidad de tick marks (gridlines verticales) renderizadas en el área de barras. */
export const WATERFALL_TICK_COUNT = 5;
