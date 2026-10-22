/** Fuente única de duración, usada en cliente y servidor. */
export const TIEMPOS_CALIFICACION = Object.freeze({
  analisis: 1400,
  subpuntajes: 1800,
  total: 2300,
  mensaje: 3200,
});
export const CELEBRACION_MS = Object.values(TIEMPOS_CALIFICACION).reduce(
  (total, tramo) => total + tramo, 0,
);
/** Margen solo si la TV tarda en confirmar que comenzó a mostrar la nota. */
export const MARGEN_PRIMERA_PRESENTACION_MS = 2500;
