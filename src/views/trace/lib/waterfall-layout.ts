// Constantes compartidas entre el header del waterfall (TimeAxisHeader) y
// las filas (SpanRow). El ancho de la columna de labels tiene que coincidir
// pixel-perfect entre ambos para que los ticks del eje queden alineados
// con las barras — definirla en un solo lugar evita drifts visuales.

export const WATERFALL_LABEL_COL_WIDTH = 320;
export const WATERFALL_ROW_HEIGHT = 26;
export const WATERFALL_DEPTH_INDENT = 14;
