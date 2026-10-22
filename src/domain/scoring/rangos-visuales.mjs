/**
 * Letras de espectáculo, sin influencia alguna sobre el puntaje guardado.
 * Las fronteras coinciden con los cuatro tramos del motor v2.
 */
export function letraArcade(total) {
  if (total >= 90) return 'S';
  if (total >= 78) return 'A';
  if (total >= 65) return 'B';
  return 'C';
}
