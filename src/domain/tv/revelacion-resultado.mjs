/**
 * Política de revelación en Karyou TV.
 *
 * Una puntuación pertenece a un TURNO, no a un video de YouTube. La misma pista
 * puede aparecer varias veces en cola; comparar video_id no sirve.
 *
 * El resultado recién guardado debe celebrarse tanto si quedan turnos en cola
 * como si la cola está vacía. Solo se omite si ya se inició realmente otro turno.
 *
 * Funciones puras para probar las carreras entre cierre del turno, sondeo y Play.
 */

/**
 * @param {{
 *   resultado: { id: number, queue_item_id: number } | null,
 *   reciente: boolean,
 *   ultimoMostradoId: number | null,
 *   turnoSonandoId: number | null,
 * }} params
 */
export function debeRevelarResultado({ resultado, reciente, ultimoMostradoId, turnoSonandoId }) {
  if (!resultado || !reciente) return false;
  if (ultimoMostradoId !== null && resultado.id <= ultimoMostradoId) return false;
  // Un sondeo puede todavía informar como 'singing' el turno que acaba de
  // guardarse: eso NO es señal de que una nueva actuación empezó.
  if (turnoSonandoId !== null && turnoSonandoId !== resultado.queue_item_id) return false;
  return true;
}

/**
 * @param {{ resultadoActivo: {queue_item_id:number}|null, turnoSonandoId:number|null }} params
 */
export function nuevaCancionInterrumpeResultado({ resultadoActivo, turnoSonandoId }) {
  return resultadoActivo !== null &&
    turnoSonandoId !== null &&
    turnoSonandoId !== resultadoActivo.queue_item_id;
}
