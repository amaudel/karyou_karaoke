/**
 * Puntuaciones: guardar resultados, aplausos y ranking.
 *
 * El motor (`src/domain/scoring`) es lógica pura y no sabe nada de bases de datos.
 * Aquí se reúnen las señales que necesita, se valida lo que reporta el navegador
 * contra lo que sabe el servidor, y se guarda el resultado.
 */
import { getDb, plano, planas } from './client.mjs';
import { obtenerSesion, identificar } from './sessions.mjs';
import { puntuar, VERSION_MOTOR } from '../domain/scoring/motor.mjs';

/* ------------------------------------------------------------------- tipos
 * @typedef {object} Telemetria
 * @property {number}  [pausas]           pausas que hizo el cantante
 * @property {number}  [saltosAtras]      veces que retrocedió la pista
 * @property {number}  [posicionFinal]    segundos reproducidos al terminar
 * @property {number}  [duracionObservada] duración que reportó el reproductor
 * @property {boolean} [terminoNatural]   llegó al final sin que la cortaran
 *
 * @typedef {object} Resultado
 * @property {number} id
 * @property {number} participant_id
 * @property {string} nickname
 * @property {string} song_title
 * @property {string} artist
 * @property {number} total
 * @property {number} rhythm
 * @property {number} energy
 * @property {number} interpretation
 * @property {string} tier
 * @property {number} engine_version
 *
 * @typedef {object} FilaRanking
 * @property {number} participant_id
 * @property {string} nickname
 * @property {number} mejor
 * @property {number} media
 * @property {number} canciones
 * @property {number} posicion
 */

/** @param {number} v @param {number} a @param {number} b */
function limitar(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

/**
 * Cuántos aplausos lleva un turno.
 * @param {number} queueItemId
 */
export async function contarAplausos(queueItemId) {
  const fila = await (await getDb())
    .prepare('select count(*) as n from cheers where queue_item_id = ?')
    .get(Number(queueItemId));
  return fila ? Number(fila.n) : 0;
}

/**
 * Aplaude el turno que está sonando.
 *
 * Un aplauso por persona y canción: el índice único se encarga, así que no hace
 * falta comprobarlo antes.
 *
 * @param {string} codigo @param {string|undefined} token @param {number} queueItemId
 */
export async function aplaudir(codigo, token, queueItemId) {
  const db = await getDb();
  const quien = await identificar(codigo, token);
  if (!quien) return { ok: false, error: 'NO_IDENTIFICADO' };

  const turno = await db
    .prepare(
      `select id, participant_id from queue_items
        where id = ? and session_id = ? and status = 'singing'`,
    )
    .get(Number(queueItemId), quien.sesion.id);
  if (!turno) return { ok: false, error: 'NO_HAY_TURNO' };

  // Aplaudirse a uno mismo no cuenta.
  if (Number(turno.participant_id) === Number(quien.participante.id)) {
    return { ok: false, error: 'NO_TE_APLAUDAS' };
  }

  try {
    await db
      .prepare(
        'insert into cheers (session_id, queue_item_id, participant_id) values (?, ?, ?)',
      )
      .run(quien.sesion.id, turno.id, quien.participante.id);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return { ok: false, error: 'YA_APLAUDISTE' };
    throw error;
  }

  return { ok: true, aplausos: await contarAplausos(turno.id) };
}

/**
 * Si esta persona ya aplaudió este turno. Para no mostrarle un botón que fallaría.
 * @param {number} queueItemId @param {number} participantId
 */
export async function yaAplaudio(queueItemId, participantId) {
  const fila = await (await getDb())
    .prepare('select 1 as si from cheers where queue_item_id = ? and participant_id = ?')
    .get(Number(queueItemId), Number(participantId));
  return Boolean(fila);
}

/**
 * Cierra el turno, calcula la puntuación y la guarda.
 *
 * Es idempotente por partida doble: el turno solo se cierra si sigue vivo, y la
 * puntuación solo se inserta si no existía. Si `ended` llega dos veces, o la TV
 * reintenta tras perder la conexión, no se generan dos resultados.
 *
 * @param {string} codigo @param {number} queueItemId @param {Telemetria} [telemetria]
 * @returns {Promise<{ ok: true, resultado: Resultado } | { ok: false, error: string }>}
 */
export async function cerrarTurnoConPuntuacion(codigo, queueItemId, telemetria = {}) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };

  const id = Number(queueItemId);
  if (!Number.isInteger(id)) return { ok: false, error: 'TURNO_INVALIDO' };

  // Ya hay resultado: devolverlo en lugar de recalcular.
  const existente = await leerResultadoPorTurno(id);
  if (existente) return { ok: true, resultado: existente };

  const turno = await db
    .prepare(
      `select
         q.id, q.participant_id, q.video_id, q.started_at,
         p.nickname,
         pi.duration_seconds,
         pi.playback_blocked,
         cast(strftime('%s', 'now') as integer)
           - cast(strftime('%s', q.started_at) as integer) as transcurridos
       from queue_items q
       join participants p on p.id = q.participant_id
       join pool_items pi on pi.video_id = q.video_id
       where q.id = ? and q.session_id = ? and q.status in ('waiting', 'singing')`,
    )
    .get(id, sesion.id);
  if (!turno) return { ok: false, error: 'TURNO_NO_EXISTE' };

  // Si la pista resultó bloqueada por derechos al intentar reproducirse, el
  // participante no pudo cantar por culpa de YouTube: se retira el turno de la
  // cola sin penalizarlo con una nota baja de abandono.
  if (Number(turno.playback_blocked) === 1) {
    await db
      .prepare(
        `update queue_items
            set status = 'skipped', finished_at = datetime('now')
          where id = ? and status in ('waiting', 'singing')`,
      )
      .run(id);
    return { ok: true, resultado: null, bloqueada: true };
  }

  /* ---------------------------------------------------- validación de señales
   *
   * El navegador reporta la telemetría y no es de fiar por definición. El servidor
   * tiene su propio reloj y la duración conocida de la pista, así que acota:
   *   - el avance no puede superar lo que ha pasado de verdad en el servidor;
   *   - el avance no puede superar la duración de la pista.
   * Con eso, mentir solo sirve para empeorar la propia nota.
   */
  const duracion = Number(turno.duration_seconds) || 0;
  const tieneInicioServidor = turno.started_at !== null && turno.started_at !== undefined;
  const transcurridos = tieneInicioServidor ? Math.max(0, Number(turno.transcurridos) || 0) : null;

  const posicionCliente = Math.max(0, Number(telemetria.posicionFinal) || 0);
  const avanceCliente = duracion > 0 && posicionCliente > 0 ? limitar(posicionCliente / duracion, 0, 1) : null;
  const avanceServidor = transcurridos !== null && duracion > 0 ? limitar(transcurridos / duracion, 0, 1) : null;

  let avance;
  if (telemetria.terminoNatural && avanceServidor === null) {
    avance = avanceCliente !== null ? Math.max(avanceCliente, 0.95) : 1;
  } else if (telemetria.terminoNatural && avanceServidor !== null) {
    const avanceReportado = avanceCliente !== null ? Math.max(avanceCliente, 0.95) : 1;
    avance = Math.min(avanceServidor, avanceReportado);
  } else if (avanceCliente !== null && avanceServidor !== null) {
    avance = Math.min(avanceServidor, avanceCliente);
  } else if (avanceCliente !== null) {
    avance = avanceCliente;
  } else if (avanceServidor !== null) {
    avance = avanceServidor;
  } else {
    avance = 0;
  }

  // Se exige un mínimo de reproducción real: un turno cerrado en cinco segundos no
  // es una actuación, aunque el navegador diga que sí.
  const minimoReproducido = duracion > 0 ? Math.min(30, duracion * 0.3) : 10;
  const pasoMinimo = transcurridos === null || transcurridos >= minimoReproducido;
  const llegoAlFinal =
    Boolean(telemetria.terminoNatural) &&
    pasoMinimo &&
    (avanceServidor === null || avanceServidor >= 0.5);

  const aplausos = await contarAplausos(id);
  const oyentes = Number(
    (await db.prepare('select count(*) as n from participants where session_id = ?').get(sesion.id)).n,
  );
  const previas = await db
    .prepare('select total from scores where participant_id = ? and session_id = ?')
    // Los DOS parámetros. Faltaba `sesion.id`, y node:sqlite no avisa cuando faltan
    // argumentos: deja el marcador en NULL en silencio, así que `session_id = NULL`
    // nunca es verdadero y la consulta devolvía siempre cero filas.
    .all(turno.participant_id, sesion.id);

  const entradas = {
    completionRatio: avance,
    interruptionCount:
      Math.max(0, Number(telemetria.pausas) || 0) +
      Math.max(0, Number(telemetria.saltos) || 0),
    endedNaturally: llegoAlFinal,
    audienceCheers: aplausos,
    audienceSize: oyentes,
    priorScores: previas.map((f) => Number(f.total)),
    songDifficulty: 3,
    // La semilla ata el resultado a este turno concreto: el mismo cantante y la
    // misma canción en otro turno dan otro resultado, porque es otra actuación.
    seed: `${sesion.code}:${turno.participant_id}:${id}`,
  };

  const calculado = puntuar(entradas);

  await db.transaction(async (tx) => {
    await tx
      .prepare(
        `update queue_items
            set status = 'done', finished_at = datetime('now')
          where id = ? and status in ('waiting', 'singing')`,
      )
      .run(id);

    await tx
      .prepare(
        `insert into scores (
           session_id, participant_id, queue_item_id, video_id,
           total, rhythm, energy, interpretation, tier,
           engine_version, seed, inputs, detail
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (queue_item_id) do nothing`,
      )
      .run(
        sesion.id,
        turno.participant_id,
        id,
        turno.video_id,
        calculado.total,
        calculado.rhythm,
        calculado.energy,
        calculado.interpretation,
        calculado.tier,
        calculado.engineVersion,
        calculado.semilla,
        JSON.stringify({ ...entradas, priorScores: entradas.priorScores.length }),
        JSON.stringify(calculado.detalle),
      );
  });

  const guardado = await leerResultadoPorTurno(id);
  if (!guardado) return { ok: false, error: 'NO_SE_PUDO_GUARDAR' };
  return { ok: true, resultado: guardado };
}

/**
 * El resultado de un turno, con el nombre de quien cantó y la canción.
 * @param {number} queueItemId
 * @returns {Promise<Resultado|null>}
 */
export async function leerResultadoPorTurno(queueItemId) {
  const fila = await (await getDb())
    .prepare(
      `select
         s.id, s.participant_id, s.queue_item_id, s.video_id,
         s.total, s.rhythm, s.energy, s.interpretation, s.tier,
         s.engine_version, s.detail, s.created_at,
         p.nickname,
         pi.song_title, pi.artist, pi.video_title
       from scores s
       join participants p on p.id = s.participant_id
       join pool_items pi on pi.video_id = s.video_id
       where s.queue_item_id = ?`,
    )
    .get(Number(queueItemId));
  return fila ? /** @type {Resultado} */ (plano(fila)) : null;
}

/**
 * El último resultado de la sesión, para que la pantalla lo muestre.
 *
 * Incluye la antigüedad en segundos: la pantalla solo debe animar un resultado
 * recién salido. Si no, cada recarga de la tele repetiría la animación de una nota
 * de hace media hora.
 *
 * @param {number} sessionId
 * @returns {Promise<Resultado|null>}
 */
export async function ultimoResultado(sessionId) {
  const fila = await (await getDb())
    .prepare(
      `select
         s.id, s.participant_id, s.queue_item_id, s.video_id,
         s.total, s.rhythm, s.energy, s.interpretation, s.tier,
         s.engine_version, s.created_at,
         cast(strftime('%s', 'now') as integer)
           - cast(strftime('%s', s.created_at) as integer) as segundos,
         p.nickname,
         pi.song_title, pi.artist, pi.video_title
       from scores s
       join participants p on p.id = s.participant_id
       join pool_items pi on pi.video_id = s.video_id
       where s.session_id = ?
       order by s.id desc
       limit 1`,
    )
    .get(sessionId);
  return fila ? /** @type {Resultado} */ (plano(fila)) : null;
}

/**
 * Ranking de la sesión, por mejor puntuación.
 *
 * Se ordena por la mejor nota y no por la media. Con pocas canciones por persona,
 * la media castiga a quien cantó una vez y le salió bien, que en una fiesta es
 * justo lo contrario de lo que se quiere premiar.
 *
 * @param {number} sessionId
 * @returns {Promise<FilaRanking[]>}
 */
export async function rankingDeSesion(sessionId) {
  const filas = await (await getDb())
    .prepare(
      `select
         p.id as participant_id,
         p.nickname,
         max(s.total) as mejor,
         cast(round(avg(s.total)) as integer) as media,
         count(*) as canciones
       from scores s
       join participants p on p.id = s.participant_id
       where s.session_id = ?
       group by p.id, p.nickname
       order by mejor desc, media desc, p.nickname asc`,
    )
    .all(sessionId);

  return /** @type {FilaRanking[]} */ (
    filas.map((fila, indice) => ({ ...fila, posicion: indice + 1 }))
  );
}

/** Todos los resultados de una sesión, del más reciente al más antiguo. */
export async function resultadosDeSesion(sessionId) {
  return planas(
    await (await getDb())
      .prepare(
        `select
           s.id, s.total, s.tier, s.created_at,
           p.nickname,
           pi.song_title, pi.artist
         from scores s
         join participants p on p.id = s.participant_id
         join pool_items pi on pi.video_id = s.video_id
         where s.session_id = ?
         order by s.id desc`,
      )
      .all(sessionId),
  );
}

/** Las noches ya terminadas, para el historial. */
export async function historialDeNoches(limite = 30) {
  return planas(
    await (await getDb())
      .prepare(
        `select
           s.id, s.code, s.name, s.status, s.created_at, s.ended_at,
           (select count(distinct sc.participant_id) from scores sc
             where sc.session_id = s.id) as cantantes,
           (select count(*) from scores sc where sc.session_id = s.id) as canciones,
           (select max(sc.total) from scores sc where sc.session_id = s.id) as mejor
         from sessions s
         where exists (select 1 from scores sc where sc.session_id = s.id)
         order by s.created_at desc
         limit ?`,
      )
      .all(limite),
  );
}
