/** Política pura de sondeo: testeable sin navegador ni Next.js. */
export const MIN_INTERVALO_MS = 2000;
export const MAX_INTERVALO_MS = 60000;
export const FACTOR_JITTER = 0.2;

export function intervaloSondeo(cada, aleatorio = 0) {
  const base = Number.isFinite(cada) ? Math.max(MIN_INTERVALO_MS, Math.min(MAX_INTERVALO_MS, cada)) : 5000;
  // Desfase positivo: evita sincronizar miles de salas al mismo instante.
  const fraccion = Math.max(0, Math.min(1, Number.isFinite(aleatorio) ? aleatorio : 0));
  return Math.round(base * (1 + FACTOR_JITTER * fraccion));
}

export function debeSondear(visible, online) {
  return Boolean(visible && online);
}
