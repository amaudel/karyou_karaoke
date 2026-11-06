/** Identifica una mesa sin mezclar participantes sin mesa de salas antiguas. */
export function claveMesaBar(fila) {
  const nombre = String(fila.table_name ?? fila.mesa ?? '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  return nombre || 'participante:' + fila.participant_id;
}

/**
 * Distribuye hasta dos canciones por mesa y ronda, alternando cantantes dentro
 * de cada mesa. La primera canción está anclada: ya aparece en la TV y no debe
 * cambiar al entrar un nuevo pedido.
 *
 * ultimos se entrega del más reciente al más antiguo. Así se respeta una ronda
 * iniciada aunque las actuaciones anteriores ya salieron de la cola activa.
 * El modo Casa no utiliza esta función.
 */
export function ordenarColaBar(filas, ultimos = []) {
  if (filas.length <= 1) return filas.map((fila) => fila.id);

  const primera = filas[0];
  const mesaActual = claveMesaBar(primera);
  const mesas = new Map();

  for (const fila of filas) {
    const clave = claveMesaBar(fila);
    if (!mesas.has(clave)) mesas.set(clave, new Map());
    const cantantes = mesas.get(clave);
    if (!cantantes.has(fila.participant_id)) cantantes.set(fila.participant_id, []);
    cantantes.get(fila.participant_id).push(fila);
  }

  // La primera canción ya consume un turno. Se empieza con el siguiente
  // cantante de su mesa si hay otro esperando.
  const cantanteActual = mesas.get(mesaActual).get(primera.participant_id);
  cantanteActual.splice(cantanteActual.findIndex((fila) => fila.id === primera.id), 1);

  const cantantesPorMesa = new Map();
  for (const [clave, cantantes] of mesas) {
    const participantes = [...cantantes.entries()].map(([id, canciones]) => ({ id, canciones }));
    const indice = participantes.findIndex((c) => c.id === primera.participant_id);
    cantantesPorMesa.set(clave, {
      cantantes: participantes,
      cursor: clave === mesaActual ? (indice + 1) % participantes.length : 0,
    });
  }

  const resultado = [primera.id];
  function tomar(clave, cantidad) {
    const mesa = cantantesPorMesa.get(clave);
    let tomados = 0;
    for (let numero = 0; numero < cantidad; numero++) {
      let siguiente = null;
      for (let intento = 0; intento < mesa.cantantes.length; intento++) {
        const cantante = mesa.cantantes[mesa.cursor];
        mesa.cursor = (mesa.cursor + 1) % mesa.cantantes.length;
        if (cantante.canciones.length) {
          siguiente = cantante.canciones.shift();
          break;
        }
      }
      if (!siguiente) break;
      resultado.push(siguiente.id);
      tomados++;
    }
    return tomados;
  }

  let yaUsadas = 0;
  for (const anterior of ultimos) {
    if (claveMesaBar(anterior) !== mesaActual) break;
    yaUsadas++;
  }
  tomar(mesaActual, Math.max(0, 1 - yaUsadas));

  // Las demás mesas consumen sus dos lugares antes de que la primera
  // vuelva a participar. Si solo queda una mesa, puede continuar cantando.
  const ronda = [...cantantesPorMesa.keys()].filter((clave) => clave !== mesaActual);
  ronda.push(mesaActual);
  let huboTurnos = true;
  while (huboTurnos) {
    huboTurnos = false;
    for (const clave of ronda) {
      if (tomar(clave, 2)) huboTurnos = true;
    }
  }
  return resultado;
}
