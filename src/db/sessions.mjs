/**
 * Sesiones, participantes y cola de turnos.
 *
 * Una sesión es una noche de karaoke. Los invitados entran sin cuenta: solo un
 * apodo. Su identidad es un token aleatorio que va en una cookie, y con él pueden
 * cancelar sus propias peticiones. Nada más.
 *
 * Quién puede hacer qué, y por qué:
 *   - Cualquiera en la sesión puede pedir una canción.
 *   - Un invitado solo puede cancelar las suyas.
 *   - Arrancar, saltar y reordenar turnos lo hace la pantalla de TV. Es el
 *     ordenador del salón: el control es el acceso físico, no una contraseña.
 *     Poner autenticación ahí sería ceremonia sin beneficio para uso personal.
 */
import { randomBytes } from 'node:crypto';
import { getDb, plano, planas } from './client.mjs';

/** Alfabeto Crockford base32: sin I, L, O ni U, que se confunden al dictarlos. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LARGO_CODIGO = 6;

/** Cuántas canciones pendientes puede acumular una persona en Modo Casa. */
export const LIMITE_PENDIENTES = 3;
/** Cuántas canciones pendientes puede acumular una persona en Modo Bar. */
export const LIMITE_PENDIENTES_BAR = 2;
/** Segundos que se reserva el turno en exclusiva al cantante en Modo Bar antes de habilitar salto. */
export const SEGUNDOS_DESBLOQUEO_BAR = 60;

const PREFIJO_BAR = '[BAR] ';

/**
 * Devuelve el límite de canciones pendientes según el modo de la sala.
 * @param {'casa'|'bar'|string} [modo]
 */
export function limitePendientesDe(modo) {
  return modo === 'bar' ? LIMITE_PENDIENTES_BAR : LIMITE_PENDIENTES;
}

/**
 * Extrae el modo ('casa' | 'bar') y el nombre visible de la sesión sin requerir migración en Turso.
 * @param {string} nombreCrudo
 * @returns {{ modo: 'casa' | 'bar', name: string }}
 */
export function extraerModoYNombre(nombreCrudo) {
  const texto = String(nombreCrudo ?? '');
  if (texto.startsWith(PREFIJO_BAR)) {
    return {
      modo: 'bar',
      name: texto.slice(PREFIJO_BAR.length).trim() || 'Karaoke Bar',
    };
  }
  return {
    modo: 'casa',
    name: texto.trim() || 'Karaoke',
  };
}

/**
 * Codifica el modo en el nombre almacenado en base de datos.
 * @param {string} nombre
 * @param {'casa'|'bar'|string} [modo]
 */
function codificarNombreConModo(nombre, modo) {
  const { name: limpio } = extraerModoYNombre(nombre);
  const base = limpio.slice(0, 70) || (modo === 'bar' ? 'Karaoke Bar' : 'Karaoke');
  return modo === 'bar' ? `${PREFIJO_BAR}${base}` : base;
}

/* ------------------------------------------------------------------- tipos
 *
 * Se declaran a propósito: node:sqlite devuelve un tipo genérico que incluye
 * Uint8Array, y sin esto TypeScript no deja usar los valores como claves ni
 * pasarlos a componentes.
 *
 * @typedef {object} Sesion
 * @property {number}      id
 * @property {string}      code
 * @property {string}      name
 * @property {'casa'|'bar'} modo
 * @property {string}      status
 * @property {string}      created_at
 * @property {string|null} ended_at
 *
 * @typedef {object} Participante
 * @property {number} id
 * @property {number} session_id
 * @property {string} token
 * @property {string} nickname
 * @property {string} joined_at
 *
 * @typedef {object} FilaCola
 * @property {number}      id
 * @property {number}      position
 * @property {string}      status
 * @property {string}      video_id
 * @property {string}      requested_at
 * @property {string|null} started_at
 * @property {number}      participant_id
 * @property {string}      nickname
 * @property {string}      song_title
 * @property {string}      artist
 * @property {string}      video_title
 * @property {number|null} duration_seconds
 * @property {string|null} channel_name
 *
 * @typedef {object} EstadoSesion
 * @property {Sesion}         sesion
 * @property {'casa'|'bar'}   modo
 * @property {number}         limitePendientes
 * @property {number}         segundosEnPantalla
 * @property {Participante[]} participantes
 * @property {FilaCola[]}     cola
 * @property {FilaCola|null}  sonando
 * @property {FilaCola[]}     esperando
 * @property {number}         total
 *
 * @typedef {object} ResumenSesion
 * @property {number} id
 * @property {string} code
 * @property {string} name
 * @property {'casa'|'bar'} modo
 * @property {string} status
 * @property {string} created_at
 * @property {number} participantes
 * @property {number} en_cola
 *
 * Los resultados se declaran con `ok` como literal para que TypeScript pueda
 * estrechar la unión: sin esto, `if (!res.ok)` no garantiza que `token` exista.
 *
 * @typedef {{ ok: true } | { ok: false, error: string }} Resultado
 * @typedef {{ ok: true, participantId: number, token: string, nickname: string }
 *         | { ok: false, error: string }} ResultadoAlta
 * @typedef {{ ok: true, queueItemId: number } | { ok: false, error: string }} ResultadoPeticion
 */

/* ------------------------------------------------------------------ códigos */

/**
 * Normaliza un código dictado en voz alta: mayúsculas, y corrige las confusiones
 * habituales (O→0, I/L→1) para que un código mal oído siga funcionando.
 * @param {string} texto
 */
export function normalizarCodigo(texto) {
  return String(texto ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

async function generarCodigo(db) {
  for (let intento = 0; intento < 50; intento += 1) {
    const bytes = randomBytes(LARGO_CODIGO);
    let code = '';
    for (let i = 0; i < LARGO_CODIGO; i += 1) {
      code += ALFABETO[bytes[i] % ALFABETO.length];
    }
    const existe = await db.prepare('select 1 from sessions where code = ?').get(code);
    if (!existe) return code;
  }
  throw new Error('No se pudo generar un código de sala libre');
}

/* ------------------------------------------------------------------ sesiones */

/**
 * @param {string} nombre
 * @param {'casa'|'bar'} [modo='casa']
 * @returns {Promise<{ id: number, code: string, modo: 'casa'|'bar' }>}
 */
export async function crearSesion(nombre, modo = 'casa') {
  const db = await getDb();
  const modoFinal = modo === 'bar' ? 'bar' : 'casa';
  const guardado = codificarNombreConModo(nombre, modoFinal);
  const code = await generarCodigo(db);

  const res = await db
    .prepare('insert into sessions (code, name) values (?, ?)')
    .run(code, guardado);

  return { id: Number(res.lastInsertRowid), code, modo: modoFinal };
}

/**
 * @param {string} codigo
 * @returns {Promise<Sesion|null>}
 */
export async function obtenerSesion(codigo) {
  const code = normalizarCodigo(codigo);
  if (code.length !== LARGO_CODIGO) return null;
  const fila = await (await getDb()).prepare('select * from sessions where code = ?').get(code);
  if (!fila) return null;
  const base = plano(fila);
  const { modo, name } = extraerModoYNombre(base.name);
  return /** @type {Sesion} */ ({ ...base, name, modo });
}

/**
 * Las sesiones abiertas, para la portada.
 * @returns {Promise<ResumenSesion[]>}
 */
export async function listarSesiones() {
  /** @type {ResumenSesion[]} */
  const filas = await (await getDb())
    .prepare(
      `select
         s.id, s.code, s.name, s.status, s.created_at,
         (select count(*) from participants p where p.session_id = s.id) as participantes,
         (select count(*) from queue_items q
           where q.session_id = s.id and q.status in ('waiting', 'singing')) as en_cola
       from sessions s
       where s.status <> 'finished'
       order by s.created_at desc`,
    )
    .all();
  return planas(filas).map((f) => {
    const { modo, name } = extraerModoYNombre(f.name);
    return { ...f, name, modo };
  });
}

/** @param {string} codigo @param {string} estado
 * @returns {Promise<Resultado>}
 */
export async function cambiarEstadoSesion(codigo, estado) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (!['active', 'paused', 'finished'].includes(estado)) {
    return { ok: false, error: 'ESTADO_INVALIDO' };
  }

  await db
    .prepare(
      `update sessions
          set status = ?, ended_at = case when ? = 'finished' then datetime('now') else ended_at end
        where id = ?`,
    )
    .run(estado, estado, sesion.id);

  return { ok: true };
}

/**
 * Cambia el modo de la sala ('casa' | 'bar') en caliente.
 * Si pasa a modo 'bar', reordena la cola pendiente de forma justa (Round-Robin).
 * @param {string} codigo
 * @param {'casa'|'bar'} modo
 * @returns {Promise<Resultado>}
 */
export async function cambiarModoSesion(codigo, modo) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (modo !== 'casa' && modo !== 'bar') return { ok: false, error: 'MODO_INVALIDO' };

  const nuevoNombre = codificarNombreConModo(sesion.name, modo);
  await db.prepare('update sessions set name = ? where id = ?').run(nuevoNombre, sesion.id);

  if (modo === 'bar') {
    await reordenarColaBar(sesion.id);
  }

  return { ok: true };
}

/* -------------------------------------------------------------- participantes */

/**
 * @param {number} sessionId
 * @param {string|undefined} token
 * @returns {Promise<Participante|null>}
 */
async function participantePorToken(sessionId, token) {
  if (!token) return null;
  const fila = await (await getDb())
    .prepare('select * from participants where session_id = ? and token = ?')
    .get(sessionId, String(token));
  return fila ? /** @type {Participante} */ (plano(fila)) : null;
}

/**
 * Une a alguien a la sesión. No hay cuentas: solo un apodo.
 *
 * Si el apodo ya está en uso se rechaza en lugar de reutilizar la identidad del
 * otro. Devolver el token ajeno permitiría a cualquiera cancelar peticiones que no
 * son suyas con solo saberse el nombre.
 *
 * @param {string} codigo
 * @param {string} apodo
 * @param {string} [tokenActual]
 * @returns {Promise<ResultadoAlta>}
 */
export async function unirseSesion(codigo, apodo, tokenActual = undefined) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (sesion.status === 'finished') return { ok: false, error: 'SESION_CERRADA' };

  const limpio = String(apodo ?? '').trim().slice(0, 24);
  if (limpio.length === 0) return { ok: false, error: 'APODO_VACIO' };

  const existente = await db
    .prepare('select * from participants where session_id = ? and lower(nickname) = lower(?)')
    .get(sesion.id, limpio);

  if (existente) {
    const p = plano(existente);
    if (tokenActual && p.token === tokenActual) {
      return { ok: true, participantId: Number(p.id), token: p.token, nickname: p.nickname };
    }
    return { ok: false, error: 'APODO_OCUPADO' };
  }

  const token = randomBytes(16).toString('hex');
  const res = await db
    .prepare('insert into participants (session_id, token, nickname) values (?, ?, ?)')
    .run(sesion.id, token, limpio);

  return { ok: true, participantId: Number(res.lastInsertRowid), token, nickname: limpio };
}

/**
 * Quién es el dueño de esta cookie.
 * @param {string} codigo @param {string|undefined} token
 * @returns {Promise<{ sesion: Sesion, participante: Participante }|null>}
 */
export async function identificar(codigo, token) {
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return null;
  const p = await participantePorToken(sesion.id, token);
  if (!p) return null;
  return { sesion, participante: p };
}

/**
 * Lista de participantes de la sesión.
 * @param {number} sessionId
 * @returns {Promise<Participante[]>}
 */
export async function listarParticipantes(sessionId) {
  /** @type {Participante[]} */
  const filas = await (await getDb())
    .prepare(
      `select id, session_id, nickname, joined_at
         from participants where session_id = ?
        order by joined_at asc`,
    )
    .all(sessionId);
  return planas(filas);
}

/* ----------------------------------------------------------------- la cola */

/**
 * Pide una canción. En Modo Casa va al final de la cola (FIFO); en Modo Bar se
 * intercala por rondas (Round-Robin) para que ninguna mesa acapare dos turnos
 * seguidos mientras otra espera su primera canción.
 *
 * @param {string} codigo
 * @param {string|undefined} token
 * @param {string} videoId
 * @returns {Promise<ResultadoPeticion>}
 */
export async function pedirCancion(codigo, token, videoId) {
  const db = await getDb();
  const quien = await identificar(codigo, token);
  if (!quien) return { ok: false, error: 'NO_IDENTIFICADO' };
  if (quien.sesion.status !== 'active') return { ok: false, error: 'SESION_NO_ACTIVA' };

  if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId ?? ''))) {
    return { ok: false, error: 'PISTA_INVALIDA' };
  }

  // Solo se puede pedir lo que de verdad se reproduce. `playback_blocked` filtra
  // las que YouTube bloquea por derechos.
  const pista = await db
    .prepare(
      `select 1 from pool_items p
         join channels c on c.id = p.channel_id
        where p.video_id = ? and p.embeddable = 1 and p.playback_blocked = 0
          and c.excluded = 0`,
    )
    .get(videoId);
  if (!pista) return { ok: false, error: 'PISTA_NO_DISPONIBLE' };

  const limite = limitePendientesDe(quien.sesion.modo);
  const pendientes = (
    await db
      .prepare(
        `select count(*) as n from queue_items
          where session_id = ? and participant_id = ? and status in ('waiting', 'singing')`,
      )
      .get(quien.sesion.id, quien.participante.id)
  ).n;
  if (pendientes >= limite) return { ok: false, error: 'LIMITE_ALCANZADO' };

  const ultima = (
    await db
      .prepare(
        `select coalesce(max(position), 0) as m from queue_items
          where session_id = ? and status in ('waiting', 'singing')`,
      )
      .get(quien.sesion.id)
  ).m;

  try {
    const res = await db
      .prepare(
        `insert into queue_items (session_id, participant_id, video_id, position)
         values (?, ?, ?, ?)`,
      )
      .run(quien.sesion.id, quien.participante.id, videoId, ultima + 1);
    const queueItemId = Number(res.lastInsertRowid);

    if (quien.sesion.modo === 'bar') {
      await reordenarColaBar(quien.sesion.id);
    }

    return { ok: true, queueItemId };
  } catch (error) {
    // El índice único parcial rechaza el duplicado; no hace falta consultarlo antes.
    if (String(error.message).includes('UNIQUE')) return { ok: false, error: 'YA_PEDIDA' };
    throw error;
  }
}

/**
 * Cancela una petición propia. Un invitado no puede cancelar la de otro.
 * @param {string} codigo @param {string|undefined} token @param {number} queueItemId
 * @returns {Promise<Resultado>}
 */
export async function cancelarPeticion(codigo, token, queueItemId) {
  const db = await getDb();
  const quien = await identificar(codigo, token);
  if (!quien) return { ok: false, error: 'NO_IDENTIFICADO' };

  const res = await db
    .prepare(
      `update queue_items
          set status = 'cancelled', finished_at = datetime('now')
        where id = ? and session_id = ? and participant_id = ?
          and status in ('waiting', 'singing')`,
    )
    .run(Number(queueItemId), quien.sesion.id, quien.participante.id);

  if (res.changes === 0) return { ok: false, error: 'NO_ES_TUYA_O_YA_EMPEZO' };

  await compactarCola(quien.sesion.id);
  return { ok: true };
}

/** Deja las posiciones en 1..N sin huecos. */
async function compactarCola(sessionId) {
  const db = await getDb();
  const filas = await db
    .prepare(
      `select id from queue_items
        where session_id = ? and status in ('waiting', 'singing')
        order by position asc`,
    )
    .all(sessionId);

  await aplicarOrdenCola(db, filas.map((f) => f.id));
}

/**
 * Reordena la cola en Modo Bar usando Round-Robin por participante:
 * 1. Respeta la canción que ya está 'singing' (o la primera 'waiting' ya cargada en TV).
 * 2. Intercala el resto por número de ronda (1ª canción de cada persona antes que la 2ª).
 * @param {number} sessionId
 */
async function reordenarColaBar(sessionId) {
  const db = await getDb();
  const filas = await db
    .prepare(
      `select id, participant_id, status, position from queue_items
        where session_id = ? and status in ('waiting', 'singing')
        order by case when status = 'singing' then 0 else 1 end, position asc, id asc`,
    )
    .all(sessionId);

  if (filas.length <= 2) return;

  const vistos = new Map();
  // La primera fila es la que está sonando o la que ya está preparada en la TV:
  // nunca se le quita de la pantalla al cantante que ya tiene su turno listo.
  const fijada = filas[0];
  vistos.set(fijada.participant_id, 1);

  const resto = filas.slice(1).sort((a, b) => a.id - b.id);
  const conRonda = resto.map((f) => {
    const ronda = (vistos.get(f.participant_id) ?? 0) + 1;
    vistos.set(f.participant_id, ronda);
    return { ...f, ronda };
  });

  conRonda.sort((a, b) => a.ronda - b.ronda || a.id - b.id);

  const idsOrdenados = [fijada.id, ...conRonda.map((f) => f.id)];
  await aplicarOrdenCola(db, idsOrdenados);
}

/**
 * Aplica un nuevo orden de posiciones 1..N pasando por posiciones negativas
 * temporales para no chocar con el índice único `uq_queue_posicion`.
 * @param {any} db
 * @param {number[]} ids
 */
async function aplicarOrdenCola(db, ids) {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [indice, id] of ids.entries()) {
      await tx
        .prepare('update queue_items set position = ? where id = ?')
        .run(-(indice + 1), id);
    }
    for (const [indice, id] of ids.entries()) {
      await tx
        .prepare('update queue_items set position = ? where id = ?')
        .run(indice + 1, id);
    }
  });
}

/**
 * Calcula cuántos segundos lleva la primera canción en espera preparada en la TV.
 * Toma el máximo entre su `requested_at` y el `finished_at` del último turno cerrado.
 * @param {number} sessionId
 * @param {FilaCola|undefined} primeroEsperando
 * @returns {Promise<number>}
 */
async function segundosEsperandoEnTV(sessionId, primeroEsperando) {
  if (!primeroEsperando) return 0;
  const db = await getDb();
  const fila = await db
    .prepare(
      `select
         max(
           0,
           cast(
             (julianday('now') - julianday(
               max(
                 ?,
                 coalesce(
                   (select max(finished_at) from queue_items
                     where session_id = ? and status in ('done', 'skipped', 'cancelled')),
                   ?
                 )
               )
             )) * 86400 as integer
           )
         ) as segundos`,
    )
    .get(primeroEsperando.requested_at, sessionId, primeroEsperando.requested_at);
  return Number(fila?.segundos ?? 0);
}

/**
 * Marca quién está cantando. Solo puede haber uno a la vez.
 * @param {string} codigo @param {number} queueItemId
 * @returns {Promise<Resultado>}
 */
export async function iniciarTurno(codigo, queueItemId) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };

  const item = await db
    .prepare(
      `select * from queue_items
        where id = ? and session_id = ? and status in ('waiting', 'singing')`,
    )
    .get(Number(queueItemId), sesion.id);
  if (!item) return { ok: false, error: 'TURNO_NO_EXISTE' };

  await db.transaction(async (tx) => {
    // Cualquier otro turno marcado como sonando vuelve a la cola.
    await tx
      .prepare(
        `update queue_items set status = 'waiting', started_at = null
          where session_id = ? and status = 'singing' and id != ?`,
      )
      .run(sesion.id, item.id);

    await tx
      .prepare(
        `update queue_items set status = 'singing', started_at = coalesce(started_at, datetime('now'))
          where id = ?`,
      )
      .run(item.id);
  });

  return { ok: true };
}

/**
 * Inicia el turno desde el móvil respetando las reglas del modo (Casa vs Bar):
 * - En Modo Casa: cualquier participante de la sala puede darle Play.
 * - En Modo Bar: durante los primeros 60s solo el dueño del turno puede darle Play;
 *   pasados los 60s de inactividad, cualquiera puede iniciarlo o saltarlo.
 * @param {string} codigo
 * @param {string|undefined} token
 * @param {number} queueItemId
 * @returns {Promise<Resultado>}
 */
export async function iniciarTurnoMovil(codigo, token, queueItemId) {
  const estado = await estadoSesion(codigo);
  if (!estado) return { ok: false, error: 'SESION_NO_EXISTE' };

  const primero = estado.esperando[0];
  if (!primero || primero.id !== Number(queueItemId)) {
    return iniciarTurno(codigo, queueItemId);
  }

  if (estado.modo === 'bar') {
    const quien = await identificar(codigo, token);
    const esDuenio = Boolean(quien && quien.participante.id === primero.participant_id);
    if (!esDuenio && estado.segundosEnPantalla < SEGUNDOS_DESBLOQUEO_BAR) {
      return { ok: false, error: 'TURNO_RESERVADO_BAR' };
    }
  }

  return iniciarTurno(codigo, queueItemId);
}

/**
 * Salta un turno en espera cuando el cantante no aparece (Modo Bar tras 60s, o Modo Casa).
 * Cierra el turno como 'skipped' sin afectar el ranking del participante ausente.
 * @param {string} codigo
 * @param {string|undefined} token
 * @param {number} queueItemId
 * @returns {Promise<Resultado>}
 */
export async function saltarTurnoInactivo(codigo, token, queueItemId) {
  const quien = await identificar(codigo, token);
  if (!quien) return { ok: false, error: 'NO_IDENTIFICADO' };

  const estado = await estadoSesion(codigo);
  if (!estado) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (estado.sonando) return { ok: false, error: 'YA_ESTA_CANTANDO' };

  const primero = estado.esperando[0];
  if (!primero || primero.id !== Number(queueItemId)) {
    return { ok: false, error: 'TURNO_NO_EXISTE' };
  }

  const esDuenio = quien.participante.id === primero.participant_id;
  if (estado.modo === 'bar' && !esDuenio && estado.segundosEnPantalla < SEGUNDOS_DESBLOQUEO_BAR) {
    return { ok: false, error: 'TURNO_RESERVADO_BAR' };
  }

  return cerrarTurno(codigo, queueItemId, 'skipped');
}

/**
 * Cierra el turno actual.
 * @param {string} codigo @param {number} queueItemId
 * @param {'done'|'skipped'} resultado
 * @returns {Promise<Resultado>}
 */
export async function cerrarTurno(codigo, queueItemId, resultado) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (!['done', 'skipped'].includes(resultado)) {
    return { ok: false, error: 'RESULTADO_INVALIDO' };
  }

  const res = await db
    .prepare(
      `update queue_items
          set status = ?, finished_at = datetime('now')
        where id = ? and session_id = ? and status in ('waiting', 'singing')`,
    )
    .run(resultado, Number(queueItemId), sesion.id);

  if (res.changes === 0) return { ok: false, error: 'TURNO_NO_EXISTE' };
  await compactarCola(sesion.id);
  return { ok: true };
}

/**
 * Sube o baja un turno una posición.
 *
 * Se intercambian las posiciones pasando por un valor temporal: el índice único de
 * (sesión, posición) no admite que dos filas compartan posición ni un instante, así
 * que la asignación directa fallaría a mitad de la transacción.
 *
 * @param {string} codigo @param {number} queueItemId @param {-1|1} direccion
 * @returns {Promise<Resultado>}
 */
export async function moverEnCola(codigo, queueItemId, direccion) {
  const db = await getDb();
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return { ok: false, error: 'SESION_NO_EXISTE' };
  if (direccion !== -1 && direccion !== 1) return { ok: false, error: 'DIRECCION_INVALIDA' };

  const item = await db
    .prepare(
      `select id, position from queue_items
        where id = ? and session_id = ? and status in ('waiting', 'singing')`,
    )
    .get(Number(queueItemId), sesion.id);
  if (!item) return { ok: false, error: 'TURNO_NO_EXISTE' };

  const vecino = await db
    .prepare(
      `select id, position from queue_items
        where session_id = ? and status in ('waiting', 'singing') and position = ?`,
    )
    .get(sesion.id, item.position + direccion);
  if (!vecino) return { ok: false, error: 'YA_ESTA_EN_EL_EXTREMO' };

  await db.transaction(async (tx) => {
    await tx.prepare('update queue_items set position = ? where id = ?').run(-1, item.id);
    await tx
      .prepare('update queue_items set position = ? where id = ?')
      .run(item.position, vecino.id);
    await tx
      .prepare('update queue_items set position = ? where id = ?')
      .run(vecino.position, item.id);
  });

  return { ok: true };
}

/* ------------------------------------------------------------------ consultas */

/** Filtro compartido: la cola viva de una sesión, en orden. */
const SQL_COLA = `
  select
    q.id, q.position, q.status, q.video_id,
    q.requested_at, q.started_at,
    p.id    as participant_id,
    p.nickname,
    pi.song_title, pi.artist, pi.video_title,
    pi.duration_seconds,
    ch.name as channel_name
  from queue_items q
  join participants p on p.id = q.participant_id
  join pool_items pi on pi.video_id = q.video_id
  left join channels ch on ch.id = pi.channel_id
  where q.session_id = ? and q.status in ('waiting', 'singing')
`;

/**
 * La cola viva, con el turno que está sonando primero.
 * @param {number} sessionId
 * @returns {Promise<FilaCola[]>}
 */
export async function leerCola(sessionId) {
  const db = await getDb();
  // Se anota con una variable y no con un cast sobre la expresión: el cast sobre
  // el resultado encadenado no propaga el tipo y las propiedades acaban en `any`.
  /** @type {FilaCola[]} */
  const filas = await db
    .prepare(
      `${SQL_COLA}
       order by case when q.status = 'singing' then 0 else 1 end, q.position asc`,
    )
    .all(sessionId);
  return planas(filas);
}

/**
 * Lo que pinta la pantalla: sesión, participantes, cola y turno actual.
 *
 * Es una sola llamada a propósito: la TV la repite cada pocos segundos y no debe
 * hacer cinco consultas por vuelta.
 *
 * @param {string} codigo
 * @returns {Promise<EstadoSesion|null>}
 */
export async function estadoSesion(codigo) {
  const sesion = await obtenerSesion(codigo);
  if (!sesion) return null;

  const cola = await leerCola(sesion.id);
  const sonando = cola.find((f) => f.status === 'singing') ?? null;
  const esperando = cola.filter((f) => f.status === 'waiting');
  const segundosEnPantalla = !sonando
    ? await segundosEsperandoEnTV(sesion.id, esperando[0])
    : 0;

  return {
    sesion,
    modo: sesion.modo,
    limitePendientes: limitePendientesDe(sesion.modo),
    segundosEnPantalla,
    participantes: await listarParticipantes(sesion.id),
    cola,
    sonando,
    esperando,
    total: cola.length,
  };
}
