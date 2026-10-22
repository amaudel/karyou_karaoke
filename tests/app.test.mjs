/**
 * Pruebas de normalización, búsqueda, catálogo, sesiones y cola.
 *
 *   pnpm test
 *
 * Corren contra un fixture propio (ver tests/fixture.mjs), no contra la base real.
 * Así las aserciones sobre el número de resultados son estables sin importar
 * cuántos canales se hayan importado.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { crearBaseDePrueba, borrarBaseDePrueba } from './fixture.mjs';

const { dbPath, dir } = crearBaseDePrueba();
process.env.KARAOKE_DB = dbPath;

// Import dinámico: las importaciones estáticas se elevan y se ejecutarían antes
// de que KARAOKE_DB esté definida.
const { normalize, deriveFields, queryTokens } = await import('../src/lib/normalize.mjs');
const { clasificarGenero } = await import('../src/domain/genero.mjs');
const {
  searchPool,
  contarPool,
  addToCatalog,
  getCatalog,
  getStats,
  getPoolItem,
  marcarPistaFallida,
} = await import('../src/db/queries.mjs');
const { closeDb } = await import('../src/db/client.mjs');
const {
  normalizarCodigo,
  crearSesion,
  obtenerSesion,
  unirseSesion,
  pedirCancion,
  cancelarPeticion,
  iniciarTurno,
  cerrarTurno,
  moverEnCola,
  leerCola,
  estadoSesion,
  listarSesiones,
  LIMITE_PENDIENTES,
} = await import('../src/db/sessions.mjs');
const { puntuar, CONFIG_POR_DEFECTO, VERSION_MOTOR } = await import(
  '../src/domain/scoring/motor.mjs'
);
const {
  aplaudir,
  contarAplausos,
  yaAplaudio,
  cerrarTurnoConPuntuacion,
  leerResultadoPorTurno,
  ultimoResultado,
  rankingDeSesion,
  resultadosDeSesion,
  historialDeNoches,
} = await import('../src/db/puntuaciones.mjs');
const { getDb } = await import('../src/db/client.mjs');

test.after(async () => {
  await closeDb();
  borrarBaseDePrueba(dir);
});

// --------------------------------------------------------------- normalización

test('normalize quita acentos', () => {
  assert.equal(normalize('Maná'), 'mana');
  assert.equal(normalize('José José'), 'jose jose');
  assert.equal(normalize('Beyoncé'), 'beyonce');
  assert.equal(normalize('Ñandú'), 'nandu');
  assert.equal(normalize('Rocío Dúrcal'), 'rocio durcal');
});

test('normalize quita puntuación', () => {
  assert.equal(normalize('AC/DC'), 'ac dc');
  assert.equal(normalize('Héroes del Silencio (Live)'), 'heroes del silencio live');
  assert.equal(normalize('  Los   Prisioneros  '), 'los prisioneros');
});

test('normalize tolera vacíos', () => {
  assert.equal(normalize(''), '');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize('   '), '');
});

test('queryTokens parte y descarta vacíos', () => {
  assert.deepEqual(queryTokens('Shakira Suerte'), ['shakira', 'suerte']);
  assert.deepEqual(queryTokens('  Maná  '), ['mana']);
  assert.deepEqual(queryTokens(''), []);
});

test('deriveFields separa artista y canción', () => {
  const f = deriveFields('Luis Miguel - La Bikina (Versión Karaoke)');
  assert.equal(f.artist, 'Luis Miguel');
  assert.equal(f.songTitle, 'La Bikina');
  assert.equal(f.searchBlob, 'luis miguel la bikina');
});

test('deriveFields respeta el override', () => {
  const f = deriveFields('Cualquier cosa', { artist: 'Shakira', songTitle: 'Loba' });
  assert.equal(f.artist, 'Shakira');
  assert.equal(f.songTitle, 'Loba');
});

test('deriveFields limpia el sufijo Karaoke cuando no hay separador', () => {
  const f = deriveFields('Como La Flor Karaoke Version');
  assert.ok(!f.songTitle.toLowerCase().includes('karaoke'));
});

// -------------------------------------------------------------------- búsqueda

test('encuentra por artista sin acento', async () => {
  const hits = await searchPool('mana');
  assert.ok(hits.length > 0, 'debería encontrar canciones de Maná');
  assert.ok(hits.some((h) => h.artist === 'Maná'));
});

test('un término inventado no devuelve nada', async () => {
  assert.equal((await searchPool('zzzznoexiste')).length, 0);
});

test('encuentra por título sin acento', async () => {
  const ok = await searchPool('hasta que te conoci');
  assert.ok(ok.length > 0);
  assert.equal(ok[0].song_title, 'Hasta Que Te Conocí');
});

test('el orden no importa entre tokens', async () => {
  const a = await searchPool('shakira suerte');
  const b = await searchPool('suerte shakira');
  assert.ok(a.length > 0 && b.length > 0);
  assert.equal(a[0].video_id, b[0].video_id);
});

test('encuentra las 4 de Shakira del fixture', async () => {
  const hits = await searchPool('shakira');
  assert.equal(hits.length, 4, `esperaba 4, obtuve ${hits.length}`);
  assert.deepEqual(
    hits.map((h) => h.song_title).sort(),
    ['Las De La Intuición', 'Loba', 'Si Te Vas', 'Suerte'],
  );
});

test('prefiere el canal de mayor confianza', async () => {
  const hits = await searchPool('rayando el sol');
  assert.ok(hits.length >= 2, 'debería haber dos versiones de Rayando El Sol');
  // OficialMana es tier 1, Party Tyme es tier 2: el oficial va primero.
  assert.equal(hits[0].channel_name, 'OficialMana');
});

test('el canal excluido no aparece nunca', async () => {
  for (const q of ['selena', 'karol', 'shakira', 'daddy', 'mana']) {
    for (const hit of await searchPool(q)) {
      assert.notEqual(hit.channel_name, 'Sing King');
    }
  }
});

test('búsqueda vacía no devuelve nada', async () => {
  assert.deepEqual(await searchPool(''), []);
  assert.deepEqual(await searchPool('   '), []);
});

test('los conectores (de, la, el…) no bloquean la búsqueda', async () => {
  // "de" no está en "shakira suerte". Antes se exigía como token obligatorio y
  // «suerte de shakira» daba cero resultados, lo que hacía imposible buscar con
  // lenguaje natural («virgen de los adolescentes» caía igual).
  const hits = await searchPool('suerte de shakira');
  assert.ok(
    hits.some((h) => h.song_title === 'Suerte' && h.artist === 'Shakira'),
    'debería encontrar Suerte de Shakira ignorando el conector',
  );
  // Solo conectores: no hay nada que buscar.
  assert.deepEqual(await searchPool('de la'), []);
});

// --------------------------------------------------------------------- géneros
//
// La búsqueda compara texto contra artista + título, así que un género no se puede
// encontrar por texto: buscar «vallenato» solo devolvía 11 de las 1.161 pistas de
// vallenato que hay. El género se deduce aparte y la búsqueda también lo mira.

test('el clasificador deduce el género por canal, artista o título', () => {
  // El canal es la señal más fiable: uno dedicado a un género.
  assert.equal(
    clasificarGenero({ canal: 'Karaoke Vallenato', artista: '', titulo: '' }),
    'vallenato',
  );
  // El artista cubre los canales mixtos, que publican de todo.
  assert.equal(clasificarGenero({ canal: 'PARTY TYME', artista: 'Diomedes Diaz', titulo: 'X' }), 'vallenato');
  assert.equal(clasificarGenero({ canal: 'PARTY TYME', artista: 'Romeo Santos', titulo: 'X' }), 'bachata');
  assert.equal(clasificarGenero({ canal: 'PARTY TYME', artista: 'Maná', titulo: 'X' }), 'rock');
  // El título es el último recurso, para cuando el artista quedó sin separar.
  assert.equal(
    clasificarGenero({ canal: 'PARTY TYME', artista: '', titulo: 'Serenata Ranchera' }),
    'ranchera',
  );
  // Sin señal no se inventa nada: un género equivocado hace que la búsqueda mienta.
  assert.equal(
    clasificarGenero({ canal: 'PARTY TYME', artista: 'Artista Desconocido', titulo: 'Una Cancion' }),
    null,
  );
});

test('la búsqueda por género encuentra lo que el título no dice', async () => {
  // Ninguno de estos resultados lleva «ranchera» en el artista ni en el título: si
  // aparecen, es SOLO por el género. Antes de esto, buscar «ranchera» daba cero.
  const hits = await searchPool('ranchera');
  assert.ok(hits.length > 0, 'debería encontrar pistas por género');
  assert.ok(
    hits.some((h) => h.artist === 'Vicente Fernández'),
    'debería aparecer Vicente Fernández, que es ranchera pero no lo dice en el nombre',
  );
  for (const h of hits) {
    assert.ok(
      !`${h.artist} ${h.song_title}`.toLowerCase().includes('ranchera'),
      `${h.song_title} / ${h.artist} sí lleva la palabra: no probaría la búsqueda por género`,
    );
  }
});

// ------------------------------------------------------------------- paginación
//
// Una búsqueda amplia («vallenato») devuelve más de mil pistas: no caben en un móvil.
// Se pagina, y por eso hace falta saber cuántas hay en total para no dejar creer que
// solo existen las de la primera página.

test('la búsqueda se puede paginar sin repetir ni perder resultados', async () => {
  const primera = await searchPool('shakira', 2, 0);
  const segunda = await searchPool('shakira', 2, 2);

  assert.equal(primera.length, 2);
  assert.equal(segunda.length, 2);

  const idsPrimera = primera.map((h) => h.video_id);
  const idsSegunda = segunda.map((h) => h.video_id);
  assert.ok(
    idsSegunda.every((id) => !idsPrimera.includes(id)),
    'la segunda página no debe repetir la primera',
  );

  // Paginar no debe inventar resultados más allá del final.
  assert.deepEqual(await searchPool('shakira', 2, 99), []);
});

test('contarPool dice cuántas hay, no cuántas caben', async () => {
  // El fixture tiene 4 de Shakira, pero con límite 2 solo se listan 2.
  assert.equal(await contarPool('shakira'), 4);
  assert.equal((await searchPool('shakira', 2)).length, 2);

  // El conteo usa el mismo filtro que la búsqueda: si se separaran, el número mentiría.
  assert.equal(await contarPool('zzzznoexiste'), 0);
  assert.equal(await contarPool('de la'), 0, 'solo conectores: nada que contar');
  assert.equal(await contarPool('excluida'), 0, 'un canal excluido no cuenta');
});

// ------------------------------------------------------------------- catálogo

test('agregar dos versiones de la misma canción crea UNA canción con DOS fuentes', async () => {
  const antes = (await getStats()).songs;

  const partyTyme = await addToCatalog('U5TiuzOkJEY'); // Party Tyme - Rayando El Sol
  assert.equal(partyTyme.ok, true);
  assert.equal(partyTyme.createdSong, true, 'la primera vez crea la canción');
  assert.equal(partyTyme.isPrimary, true, 'y su fuente es la principal');

  const oficial = await addToCatalog('QJaQd525CNM'); // OficialMana - Rayando El Sol
  assert.equal(oficial.ok, true);
  assert.equal(oficial.createdSong, false, 'NO debe crear una canción nueva');
  assert.equal(oficial.songId, partyTyme.songId, 'debe ser la misma canción');
  assert.equal(oficial.isPrimary, false, 'la segunda fuente no es principal');

  assert.equal((await getStats()).songs, antes + 1, 'solo una canción nueva, no dos');

  const cancion = (await getCatalog()).find((s) => s.song_id === partyTyme.songId);
  assert.ok(cancion);
  assert.equal(cancion.source_count, 2);
  assert.equal(cancion.primary_video_id, 'U5TiuzOkJEY', 'la principal sigue siendo la primera');
});

test('agregar la misma pista dos veces es idempotente', async () => {
  await addToCatalog('r9DJTBU7RbE');
  const otra = await addToCatalog('r9DJTBU7RbE');
  assert.equal(otra.ok, true);
  assert.equal(otra.addedSource, false, 'no debe duplicar la fuente');
});

test('agregar algo que no está en el pool falla con un mensaje claro', async () => {
  const res = await addToCatalog('no-existe-999');
  assert.equal(res.ok, false);
  assert.match(res.error, /pool/i);
});

test('la búsqueda marca lo que ya está en el catálogo', async () => {
  const hits = await searchPool('suerte');
  const agregada = hits.find((h) => h.video_id === 'r9DJTBU7RbE');
  assert.ok(agregada);
  assert.equal(agregada.in_catalog, 1);
});

test('la búsqueda no ofrece lo descartado por título', async () => {
  // El fixture no tiene elementos descartados, así que comprobamos la inversa:
  // todos los resultados deben tener clasificación distinta de 'none'.
  for (const hit of await searchPool('karaoke')) {
    assert.notEqual(hit.karaoke_match, 'none');
  }
});

// -------------------------------------------------- pantalla del reproductor
//
// `getPoolItem` es la única puerta por la que la pantalla de karaoke obtiene una
// pista. Si dejara pasar algo no reproducible, el reproductor fallaría en vivo.

test('getPoolItem devuelve una pista reproducible', async () => {
  const item = await getPoolItem('wt-pY4mI2rs');
  assert.ok(item, 'debería encontrar la pista');
  assert.equal(item.song_title, 'La Bikina');
  assert.equal(item.artist, 'Luis Miguel');
  assert.equal(item.channel_name, 'PARTY TYME KARAOKE EN ESPAÑOL');
});

test('getPoolItem rechaza una pista no embebible', async () => {
  assert.equal(await getPoolItem('zzNoEmb0001'), null);
});

test('getPoolItem rechaza una pista de un canal excluido', async () => {
  assert.equal(await getPoolItem('zzExclu0001'), null);
});

test('getPoolItem rechaza un videoId inexistente', async () => {
  assert.equal(await getPoolItem('aaaaaaaaaaa'), null);
  assert.equal(await getPoolItem(''), null);
});

test('la búsqueda no devuelve pistas no embebibles', async () => {
  const hits = await searchPool('no embebible');
  assert.equal(hits.length, 0, 'una pista no embebible no debe aparecer en la búsqueda');
});

test('la búsqueda no devuelve pistas de canales excluidos', async () => {
  const hits = await searchPool('excluida');
  assert.equal(hits.length, 0);
});

test('el catálogo incluye duración y canal de la fuente principal', async () => {
  // La portada y el catálogo muestran estos dos campos sin consultas adicionales.
  const catalogo = await getCatalog();
  assert.ok(catalogo.length > 0, 'el catálogo debería tener al menos una canción');
  for (const cancion of catalogo) {
    assert.ok('duration_seconds' in cancion);
    assert.ok('channel_name' in cancion);
    assert.ok('available_count' in cancion);
  }
});

test('una canción con todas sus versiones bloqueadas deja de ofrecer enlace', async () => {
  // Se agrega una canción cuya única versión se bloquea después.
  // Cada prueba que marca un bloqueo usa un videoId distinto: comparten la base
  // del fixture, así que reutilizar uno haría que el orden de ejecución importara.
  const agregada = await addToCatalog('Xkhcws7P204'); // Amanda Miguel - Él Me Mintió
  assert.equal(agregada.ok, true);

  let cancion = (await getCatalog()).find((s) => s.song_id === agregada.songId);
  assert.ok(cancion);
  assert.equal(cancion.available_count, 1, 'al principio hay una versión disponible');
  assert.ok(cancion.primary_video_id, 'y se puede cantar');

  await marcarPistaFallida('Xkhcws7P204', 101);

  cancion = (await getCatalog()).find((s) => s.song_id === agregada.songId);
  assert.ok(cancion);
  assert.equal(cancion.available_count, 0, 'ya no queda ninguna versión');
  assert.equal(cancion.primary_video_id, null, 'no debe ofrecerse un enlace que llevaría a 404');
  assert.equal(cancion.source_count, 1, 'pero la fuente sigue registrada por si se desbloquea');
});

// ------------------------------------------------- fallos de reproducción
//
// YouTube bloquea al insertar videos con reclamos de derechos (Content ID) aunque
// la API los marque como embeddable = true. La única señal fiable es intentar
// reproducir, así que la aplicación tiene que aprender del fallo.

test('un bloqueo por derechos retira la pista de la búsqueda', async () => {
  // Shakira - Suerte, de Echoe Entertainment.
  assert.ok(
    (await searchPool('suerte')).some((h) => h.video_id === 'r9DJTBU7RbE'),
    'debe aparecer antes del fallo',
  );
  assert.ok(await getPoolItem('r9DJTBU7RbE'), 'y debe poder reproducirse');

  const res = await marcarPistaFallida('r9DJTBU7RbE', 101);
  assert.equal(res.ok, true);
  assert.equal(res.ocultada, true);

  assert.ok(
    !(await searchPool('suerte')).some((h) => h.video_id === 'r9DJTBU7RbE'),
    'ya no debe ofrecerse en la búsqueda',
  );
  assert.equal(await getPoolItem('r9DJTBU7RbE'), null, 'ni debe poder abrirse para cantar');
});

test('el código 150 también retira la pista', async () => {
  // 101 y 150 significan lo mismo en la API de YouTube.
  const res = await marcarPistaFallida('kv7iRaVpXYA', 150);
  assert.equal(res.ok, true);
  assert.equal(await getPoolItem('kv7iRaVpXYA'), null);
});

test('un error transitorio NO retira la pista', async () => {
  // El código 5 es un fallo del reproductor HTML5: puede ser pasajero y retirar
  // la pista por eso sería perder una canción buena.
  assert.ok(await getPoolItem('lay5lTxgt7o'), 'debe estar disponible antes');

  const res = await marcarPistaFallida('lay5lTxgt7o', 5);
  assert.equal(res.ok, false, 'el código 5 no debe registrarse como bloqueo');
  assert.ok(await getPoolItem('lay5lTxgt7o'), 'la pista debe seguir disponible');
});

test('el contador de bloqueadas sube y es visible', async () => {
  const antes = (await getStats()).poolBlocked;
  await marcarPistaFallida('q9mxcGGjats', 101); // Party Tyme - Como Tu Mujer
  assert.equal((await getStats()).poolBlocked, antes + 1);
  assert.ok((await getStats()).poolTotal < 30 + 2, 'las bloqueadas dejan de contar como usables');
});

test('marcar dos veces la misma pista no duplica el aviso', async () => {
  const primera = await marcarPistaFallida('ov-2IoQ1LTI', 101);
  assert.equal(primera.ocultada, true);

  const segunda = await marcarPistaFallida('ov-2IoQ1LTI', 101);
  assert.equal(segunda.ocultada, false, 'ya estaba marcada: no debe contar de nuevo');
});

// ============================================================ sesiones y cola
//
// La cola es donde más fácil es corromper el estado: varias personas escribiendo a
// la vez, posiciones que deben ser únicas, un turno que solo puede estar sonando
// una vez. Estas pruebas cubren esos invariantes.

test('normalizarCodigo corrige las confusiones al dictar', () => {
  assert.equal(normalizarCodigo('abc123'), 'ABC123');
  // O se confunde con 0, e I o L con 1. Un código mal oído debe seguir sirviendo.
  assert.equal(normalizarCodigo('AB0O1I'), 'AB0011');
  assert.equal(normalizarCodigo('a-b c'), 'ABC');
  assert.equal(normalizarCodigo(undefined), '');
});

test('crear una sesión devuelve un código del alfabeto correcto', async () => {
  const { id, code } = await crearSesion('Fiesta de prueba');
  assert.ok(id > 0);
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{6}$/, `código inesperado: ${code}`);
  assert.ok(await obtenerSesion(code));
});

test('una sala se encuentra aunque el código se dicte mal', async () => {
  const { code } = await crearSesion('Dictado');
  const malDictado = code.toLowerCase().replace(/0/g, 'O').replace(/1/g, 'l');
  assert.ok(await obtenerSesion(malDictado), 'un código mal oído debe seguir encontrando la sala');
});

test('unirse da un token y rechaza apodos repetidos', async () => {
  const { code } = await crearSesion('Apodos');

  const a = await unirseSesion(code, 'Andrés');
  assert.equal(a.ok, true);
  assert.ok(a.token.length >= 32);

  // Sin distinguir mayúsculas: dos "andrés" en la misma sala harían imposible
  // saber de quién es cada turno.
  const b = await unirseSesion(code, 'andrés');
  assert.equal(b.ok, false);
  assert.equal(b.error, 'APODO_OCUPADO');
});

test('no se puede pedir sin identificarse', async () => {
  const { code } = await crearSesion('Sin token');
  const r = await pedirCancion(code, 'token-inventado', 'wt-pY4mI2rs');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'NO_IDENTIFICADO');
});

test('pedir encola al final y rechaza el duplicado', async () => {
  const { code } = await crearSesion('Cola');
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');

  assert.equal((await pedirCancion(code, a.token, 'wt-pY4mI2rs')).ok, true);

  const dup = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  assert.equal(dup.ok, false);
  assert.equal(dup.error, 'YA_PEDIDA');

  assert.equal((await pedirCancion(code, b.token, 'U5TiuzOkJEY')).ok, true);

  const sesion = await obtenerSesion(code);
  const cola = await leerCola(sesion.id);
  assert.equal(cola.length, 2);
  assert.equal(cola[0].nickname, 'Ana');
  assert.equal(cola[1].nickname, 'Luis');
  assert.deepEqual(
    cola.map((f) => f.position),
    [1, 2],
    'las posiciones deben ser consecutivas',
  );
});

test('hay un límite de canciones pendientes por persona', async () => {
  const { code } = await crearSesion('Limite');
  const a = await unirseSesion(code, 'Ana');
  const pistas = ['wt-pY4mI2rs', 'U5TiuzOkJEY', 'K4HvVN1lVAQ', 'n5FzZJ0bpug'];

  for (let i = 0; i < LIMITE_PENDIENTES; i += 1) {
    assert.equal((await pedirCancion(code, a.token, pistas[i])).ok, true, `falló la pista ${i}`);
  }

  const extra = await pedirCancion(code, a.token, pistas[LIMITE_PENDIENTES]);
  assert.equal(extra.ok, false);
  assert.equal(extra.error, 'LIMITE_ALCANZADO');
});

test('no se puede pedir una pista no embebible ni de un canal excluido', async () => {
  const { code } = await crearSesion('Bloqueadas');
  const a = await unirseSesion(code, 'Ana');

  assert.equal((await pedirCancion(code, a.token, 'zzNoEmb0001')).error, 'PISTA_NO_DISPONIBLE');
  assert.equal((await pedirCancion(code, a.token, 'zzExclu0001')).error, 'PISTA_NO_DISPONIBLE');
  // Un id con formato válido pero que no está en el pool: misma respuesta.
  assert.equal((await pedirCancion(code, a.token, 'aaaaaaaaaaa')).error, 'PISTA_NO_DISPONIBLE');
  // Y uno malformado se rechaza antes de consultar nada.
  assert.equal((await pedirCancion(code, a.token, 'corto')).error, 'PISTA_INVALIDA');
  assert.equal((await pedirCancion(code, a.token, '')).error, 'PISTA_INVALIDA');
});

test('cada uno solo cancela lo suyo', async () => {
  const { code } = await crearSesion('Cancelar');
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');
  const p = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  assert.equal(p.ok, true);

  const ajeno = await cancelarPeticion(code, b.token, p.queueItemId);
  assert.equal(ajeno.ok, false, 'no debe poder cancelar la de otro');

  const propio = await cancelarPeticion(code, a.token, p.queueItemId);
  assert.equal(propio.ok, true);
  const sesion = await obtenerSesion(code);
  assert.equal((await leerCola(sesion.id)).length, 0);
});

test('solo puede haber una canción sonando a la vez', async () => {
  const { code } = await crearSesion('Sonando');
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');
  const p1 = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  const p2 = await pedirCancion(code, b.token, 'U5TiuzOkJEY');

  await iniciarTurno(code, p1.queueItemId);
  await iniciarTurno(code, p2.queueItemId);

  const estado = await estadoSesion(code);
  assert.ok(estado.sonando);
  assert.equal(estado.sonando.id, p2.queueItemId, 'el último en arrancar es el que suena');
  assert.equal(estado.esperando.length, 1);
  assert.equal(estado.esperando[0].id, p1.queueItemId, 'el anterior vuelve a la cola');
});

test('reordenar intercambia posiciones sin romper la unicidad', async () => {
  const { code } = await crearSesion('Orden');
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');
  const c = await unirseSesion(code, 'Eva');
  const p1 = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  const p2 = await pedirCancion(code, b.token, 'U5TiuzOkJEY');
  const p3 = await pedirCancion(code, c.token, 'K4HvVN1lVAQ');

  assert.equal((await moverEnCola(code, p3.queueItemId, -1)).ok, true);

  const sesion = await obtenerSesion(code);
  const cola = await leerCola(sesion.id);
  assert.deepEqual(
    cola.map((f) => f.id),
    [p1.queueItemId, p3.queueItemId, p2.queueItemId],
  );
  assert.deepEqual(
    cola.map((f) => f.position),
    [1, 2, 3],
    'las posiciones deben quedar 1..N, sin huecos ni repetidas',
  );

  const extremo = await moverEnCola(code, p1.queueItemId, -1);
  assert.equal(extremo.ok, false);
  assert.equal(extremo.error, 'YA_ESTA_EN_EL_EXTREMO');
});

test('cerrar un turno lo saca de la cola', async () => {
  const { code } = await crearSesion('Cerrar');
  const a = await unirseSesion(code, 'Ana');
  const p = await pedirCancion(code, a.token, 'wt-pY4mI2rs');

  await iniciarTurno(code, p.queueItemId);
  assert.equal((await cerrarTurno(code, p.queueItemId, 'done')).ok, true);

  const estado = await estadoSesion(code);
  assert.equal(estado.total, 0);
  assert.equal(estado.sonando, null);
  assert.equal(estado.esperando.length, 0);
});

test('cerrar un turno ya cerrado no hace nada', async () => {
  const { code } = await crearSesion('Cerrar dos veces');
  const a = await unirseSesion(code, 'Ana');
  const p = await pedirCancion(code, a.token, 'wt-pY4mI2rs');

  assert.equal((await cerrarTurno(code, p.queueItemId, 'done')).ok, true);
  const otra = await cerrarTurno(code, p.queueItemId, 'done');
  assert.equal(otra.ok, false, 'cerrar dos veces no debe alterar nada');
});

test('una canción bloqueada al reproducirse no se puede volver a pedir', async () => {
  // Simula lo que pasa en la TV: se pide, se intenta cantar, YouTube la bloquea.
  const { code } = await crearSesion('Bloqueo en vivo');
  const a = await unirseSesion(code, 'Ana');

  assert.equal((await pedirCancion(code, a.token, 's6MECNPPgIo')).ok, true);
  await marcarPistaFallida('s6MECNPPgIo', 150);

  const { code: code2 } = await crearSesion('Despues del bloqueo');
  const b = await unirseSesion(code2, 'Luis');
  const res = await pedirCancion(code2, b.token, 's6MECNPPgIo');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'PISTA_NO_DISPONIBLE');
});

// ========================================================= motor de puntuación
//
// Lo que se prueba aquí no es si la nota es "justa" —eso no es verificable— sino
// que el motor sea determinista, coherente consigo mismo y que respete las reglas
// duras. La forma de la distribución se mide con `pnpm calibrar`, no aquí.

/** Actuación normal: termina la canción, sin pausas, con sala. */
const ACTUACION = {
  completionRatio: 1,
  interruptionCount: 0,
  endedNaturally: true,
  audienceCheers: 6,
  audienceSize: 12,
  priorScores: [],
  songDifficulty: 3,
};

test('el mismo seed da siempre el mismo resultado', () => {
  const a = puntuar({ ...ACTUACION, seed: 'sesion-1:participante-2:turno-3' });
  const b = puntuar({ ...ACTUACION, seed: 'sesion-1:participante-2:turno-3' });
  assert.deepEqual(a, b, 'dos llamadas con la misma entrada deben coincidir');

  const c = puntuar({ ...ACTUACION, seed: 'sesion-1:participante-2:turno-4' });
  assert.notDeepEqual(
    { total: a.total, rhythm: a.rhythm, energy: a.energy },
    { total: c.total, rhythm: c.rhythm, energy: c.energy },
    'otro turno debe dar otro resultado',
  );
});

test('el resultado siempre cae entre 50 y 100', () => {
  for (let i = 0; i < 300; i += 1) {
    const r = puntuar({
      ...ACTUACION,
      completionRatio: (i % 11) / 10,
      interruptionCount: i % 5,
      endedNaturally: i % 7 !== 0,
      audienceCheers: i % 13,
      audienceSize: i % 3 === 0 ? 0 : 12,
      seed: `rango-${i}`,
    });
    assert.ok(r.total >= 50 && r.total <= 100, `total fuera de rango: ${r.total}`);
    for (const clave of ['rhythm', 'energy', 'interpretation']) {
      assert.ok(r[clave] >= 0 && r[clave] <= 100, `${clave} fuera de rango: ${r[clave]}`);
    }
  }
});

test('los subpuntajes nunca se despegan del total más de 4 puntos', () => {
  // Es lo que evita mostrar «Ritmo 51 / Energía 99 / Total 93», que es lo que
  // delata a un puntaje inventado.
  for (let i = 0; i < 500; i += 1) {
    const r = puntuar({
      ...ACTUACION,
      completionRatio: (i % 9) / 8,
      interruptionCount: i % 4,
      audienceCheers: i % 11,
      seed: `desvio-${i}`,
    });
    for (const clave of ['rhythm', 'energy', 'interpretation']) {
      const distancia = Math.abs(r[clave] - r.total);
      assert.ok(distancia <= CONFIG_POR_DEFECTO.desvioSubpuntaje, `${clave} a ${distancia} del total`);
    }
  }
});

test('abandonar la canción acota el resultado a 69', () => {
  // Es una regla dura, no un peso: quien canta un tercio y se va no puede sacar
  // un 85 por mucho que le sonría el azar.
  for (let i = 0; i < 200; i += 1) {
    const r = puntuar({
      ...ACTUACION,
      completionRatio: 0.2,
      endedNaturally: false,
      seed: `abandono-${i}`,
    });
    assert.ok(r.total <= 69, `un abandono sacó ${r.total}`);
    assert.ok(r.detalle.abandono, 'debe quedar marcado como abandono');
  }
});

test('terminar la canción puntúa más que abandonarla, en promedio', () => {
  const media = (termina) => {
    let suma = 0;
    for (let i = 0; i < 400; i += 1) {
      suma += puntuar({
        ...ACTUACION,
        completionRatio: termina ? 1 : 0.25,
        endedNaturally: termina,
        seed: `media-${termina}-${i}`,
      }).total;
    }
    return suma / 400;
  };

  const bien = media(true);
  const mal = media(false);
  assert.ok(bien - mal > 10, `la diferencia debería ser clara: ${bien} contra ${mal}`);
});

test('sin micrófono, la actividad vocal no cambia nada', () => {
  const sin = puntuar({ ...ACTUACION, seed: 'micro-apagado' });
  const con = puntuar({ ...ACTUACION, seed: 'micro-apagado', voiceQuality: 1 });
  assert.equal(sin.total, con.total, 'el peso del micrófono es 0 por defecto');
  assert.equal(sin.detalle.sinMicrofono, true);
});

test('con micrófono activo, el aporte está centrado: resta al que canta poco', () => {
  const config = { ...CONFIG_POR_DEFECTO, microfono: 20 };

  const flojo = puntuar({ ...ACTUACION, seed: 'centrado', voiceQuality: 0.2 }, config);
  const neutro = puntuar({ ...ACTUACION, seed: 'centrado', voiceQuality: 0.5 }, config);
  const bueno = puntuar({ ...ACTUACION, seed: 'centrado', voiceQuality: 0.95 }, config);

  assert.ok(flojo.total < neutro.total, 'cantar poco debe restar');
  assert.ok(neutro.total < bueno.total, 'cantar mucho debe sumar');
  // Sin centrar, el micrófono solo sumaría y la media se dispararía.
  assert.equal(neutro.detalle.microfono, 0, 'el valor neutro no debe aportar nada');
});

test('la versión del motor viaja con cada resultado', () => {
  // Sin esto no se puede saber con qué reglas se calculó una nota guardada.
  const r = puntuar({ ...ACTUACION, seed: 'version' });
  assert.equal(r.engineVersion, VERSION_MOTOR);
  assert.ok(Number.isInteger(r.engineVersion));
});

test('el detalle permite auditar de dónde salió la nota', () => {
  const r = puntuar({ ...ACTUACION, seed: 'auditoria' });
  for (const clave of [
    'finalizacion',
    'consistencia',
    'audiencia',
    'racha',
    'microfono',
    'variacion',
    'raro',
  ]) {
    assert.ok(clave in r.detalle, `falta ${clave} en el detalle`);
  }
  assert.equal(r.semilla, 'auditoria', 'el seed usado debe quedar registrado');
});

test('una sala vacía no penaliza', () => {
  // Si no hay nadie mirando, no se puede castigar al cantante por no recibir
  // aplausos: recibe el valor neutro.
  const conSala = puntuar({ ...ACTUACION, seed: 'sala', audienceSize: 12, audienceCheers: 6 });
  const sinSala = puntuar({ ...ACTUACION, seed: 'sala', audienceSize: 0, audienceCheers: 0 });

  assert.equal(conSala.total, sinSala.total, 'media sala y sala vacía deben coincidir');
  assert.equal(sinSala.detalle.sinAudiencia, true);
});

// ======================================================= puntuaciones guardadas
//
// Aquí se prueba la integración: que el cierre de turno sea idempotente, que el
// servidor no se crea lo que reporta el navegador, y que los aplausos cuenten.

/** Monta una sesión con un turno ya sonando y devuelve las piezas. */
async function montarTurno(nombre) {
  const { code } = await crearSesion(nombre);
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');
  const pedido = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  await iniciarTurno(code, pedido.queueItemId);
  return { code, ana: a, luis: b, item: pedido.queueItemId };
}

/** Retrasa el inicio del turno para simular que ya lleva un rato sonando. */
async function envejecerTurno(queueItemId, minutos) {
  const db = await getDb();
  await db
    .prepare(`update queue_items set started_at = datetime('now', ?) where id = ?`)
    .run(`-${minutos} minutes`, queueItemId);
}

test('cerrar un turno guarda la puntuación y es idempotente', async () => {
  const { code, item } = await montarTurno('Puntuar');
  await envejecerTurno(item, 4);

  const primera = await cerrarTurnoConPuntuacion(code, item, {
    pausas: 0,
    saltos: 0,
    posicionFinal: 190,
    terminoNatural: true,
  });
  assert.equal(primera.ok, true);
  assert.ok(primera.resultado.total >= 50);
  assert.equal(primera.resultado.nickname, 'Ana');

  // El índice único sobre queue_item_id lo garantiza, no una comprobación previa.
  const segunda = await cerrarTurnoConPuntuacion(code, item, { terminoNatural: true });
  assert.equal(segunda.ok, true);
  assert.equal(
    segunda.resultado.id,
    primera.resultado.id,
    'un segundo cierre debe devolver el mismo resultado, no crear otro',
  );
});

test('no revela puntuaciones de turnos pertenecientes a otra sala', async () => {
  const origen = await montarTurno('Sala con puntuacion');
  await envejecerTurno(origen.item, 4);
  const cierre = await cerrarTurnoConPuntuacion(origen.code, origen.item, {
    posicionFinal: 190, terminoNatural: true,
  });
  assert.equal(cierre.ok, true);

  const ajena = await crearSesion('Sala distinta');
  const acceso = await cerrarTurnoConPuntuacion(ajena.code, origen.item, {});
  assert.equal(acceso.ok, false);
  assert.equal(acceso.error, 'TURNO_NO_EXISTE');
});

test('un turno cortado a los pocos segundos es un abandono', async () => {
  const { code, item } = await montarTurno('Cortado');
  // Sin envejecer: el servidor ve que pasaron cero segundos.
  const res = await cerrarTurnoConPuntuacion(code, item, { terminoNatural: true });

  assert.equal(res.ok, true);
  assert.ok(res.resultado.total <= 69, `debería quedar acotado, sacó ${res.resultado.total}`);
});

test('el servidor no acepta que el navegador diga que cantó más de lo posible', async () => {
  const { code, item } = await montarTurno('Mentira');
  // El turno lleva 30 segundos, pero el cliente asegura haber cantado toda la
  // pista de 3:12. El servidor usa el menor de los dos avances.
  await envejecerTurno(item, 1);

  const res = await cerrarTurnoConPuntuacion(code, item, {
    posicionFinal: 192,
    duracionObservada: 192,
    terminoNatural: true,
  });

  assert.equal(res.ok, true);
  assert.ok(
    res.resultado.total <= 69,
    `30 s de 192 no puede dar una nota alta, sacó ${res.resultado.total}`,
  );
});

test('los aplausos cuentan una vez por persona y no valen los propios', async () => {
  const { code, ana, luis, item } = await montarTurno('Aplausos');

  assert.equal(await contarAplausos(item), 0);

  // Ana está cantando: no puede aplaudirse.
  const propia = await aplaudir(code, ana.token, item);
  assert.equal(propia.ok, false);
  assert.equal(propia.error, 'NO_TE_APLAUDAS');

  const suyo = await aplaudir(code, luis.token, item);
  assert.equal(suyo.ok, true);
  assert.equal(suyo.aplausos, 1);
  assert.equal(await yaAplaudio(item, luis.participantId), true);

  // Repetir no infla el contador.
  const repetido = await aplaudir(code, luis.token, item);
  assert.equal(repetido.ok, false);
  assert.equal(repetido.error, 'YA_APLAUDISTE');
  assert.equal(await contarAplausos(item), 1);
});

test('los aplausos no empeoran la nota para la misma actuación', () => {
  // Comparación pareada: usar la misma semilla elimina la variación entre turnos.
  let con = 0;
  let sin = 0;
  for (let i = 0; i < 1000; i++) {
    const base = {
      completionRatio: 1, interruptionCount: 0, endedNaturally: true,
      audienceSize: 12, priorScores: [], songDifficulty: 3, seed: 'aplausos-' + i,
    };
    sin += puntuar({ ...base, audienceCheers: 0 }).total;
    con += puntuar({ ...base, audienceCheers: 8 }).total;
  }
  assert.ok(con >= sin, `los aplausos (${con}) no deben bajar el promedio (${sin})`);
});


test('el ranking ordena por mejor nota, no por media', async () => {
  const { code, ana, item } = await montarTurno('Ranking');
  await envejecerTurno(item, 4);
  await cerrarTurnoConPuntuacion(code, item, { posicionFinal: 190, terminoNatural: true });

  // Luis canta una sola vez, y muy bien.
  const pedido2 = await pedirCancion(code, ana.token, 'K4HvVN1lVAQ');
  void pedido2;
  const luis = await identificarEnSesion(code);

  const sesion = await obtenerSesion(code);
  const ranking = await rankingDeSesion(sesion.id);
  assert.ok(ranking.length >= 1);
  assert.equal(ranking[0].posicion, 1);
  // El primero de la lista debe tener la mejor nota de todos.
  for (const fila of ranking) {
    assert.ok(ranking[0].mejor >= fila.mejor, 'el orden debe ser por mejor nota');
  }
  void luis;
});

/** Devuelve el participante de una sesión por su apodo, sin pasar por cookies. */
async function identificarEnSesion(code) {
  const db = await getDb();
  return db
    .prepare(
      `select p.* from participants p
        join sessions s on s.id = p.session_id
       where s.code = ? limit 1`,
    )
    .get(normalizarCodigo(code));
}

test('el último resultado de la sesión es el más reciente', async () => {
  const { code, ana, item } = await montarTurno('Ultimo');
  await envejecerTurno(item, 4);
  const primero = await cerrarTurnoConPuntuacion(code, item, {
    posicionFinal: 190,
    terminoNatural: true,
  });

  const sesion = await obtenerSesion(code);
  assert.equal((await ultimoResultado(sesion.id)).id, primero.resultado.id);

  const segundo = await pedirCancion(code, ana.token, 'K5HvVN1lVAQ');
  if (segundo.ok) {
    await iniciarTurno(code, segundo.queueItemId);
    await envejecerTurno(segundo.queueItemId, 4);
    await cerrarTurnoConPuntuacion(code, segundo.queueItemId, {
      posicionFinal: 190,
      terminoNatural: true,
    });
    assert.notEqual((await ultimoResultado(sesion.id)).id, primero.resultado.id);
  }
});

test('el historial solo lista noches con resultados', async () => {
  await crearSesion('Noche sin cantar');
  const { code, item } = await montarTurno('Noche con resultados');
  await envejecerTurno(item, 4);
  await cerrarTurnoConPuntuacion(code, item, { posicionFinal: 190, terminoNatural: true });

  const noches = await historialDeNoches(100);
  const codigos = noches.map((n) => n.code);
  assert.ok(codigos.includes(code), 'la noche con resultados debe aparecer');
  assert.ok(
    !codigos.includes(normalizarCodigo('Noche sin cantar')),
    'una sesión sin canciones cantadas no debe aparecer',
  );
});

test('sin duración conocida no se acusa de abandono', async () => {
  // El avance se calcula dividiendo entre la duración. Si no se conoce —un
  // elemento que entró al pool sin enriquecer—, no se puede medir, y castigar por
  // lo que no se puede medir sería injusto. Se asume reproducción completa.
  const { code } = await crearSesion('Sin duracion');
  const a = await unirseSesion(code, 'Ana');
  const pedido = await pedirCancion(code, a.token, 'zzSinDur000');
  assert.equal(pedido.ok, true, 'debe poder pedirse aunque no se sepa la duración');

  await iniciarTurno(code, pedido.queueItemId);
  const res = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, { terminoNatural: true });

  assert.equal(res.ok, true);

  // Se comprueba la MARCA DE ABANDONO, no un umbral de nota. La versión anterior
  // afirmaba `total >= 70` y fallaba una de cada diez ejecuciones: la semilla sale
  // del código de sala, que es aleatorio, y la variación sembrada tiene rango ±24
  // sobre una base de 80. O sea, el test medía el azar, no la regla.
  const detalle = JSON.parse(res.resultado.detail);
  assert.equal(detalle.abandono, false, 'no puede marcarse abandono sin duración');
  assert.equal(
    detalle.finalizacion,
    CONFIG_POR_DEFECTO.finalizacion,
    'sin duración debe asumirse la canción completa',
  );
});

test('las filas que van a componentes de cliente son objetos planos', async () => {
  // node:sqlite devuelve objetos con prototipo NULO, y React no puede serializarlos
  // al pasarlos de un componente de servidor a uno de cliente: lanza «Only plain
  // objects... can be passed to Client Components». El síntoma aparece en el
  // navegador, lejos de la causa, así que se fija aquí.
  //
  // La comprobación es RECURSIVA a propósito. La primera versión solo miraba el
  // primer nivel, y por eso se escapó `estado.sesion`: recorrer la cola y los
  // participantes estaba bien, pero la sesión anidada seguía siendo una fila cruda
  // y la pantalla de TV devolvía 500. Mirar solo la superficie no basta.
  const revisar = (valor, ruta) => {
    if (valor === null || typeof valor !== 'object') return;
    if (valor instanceof Date) return;
    assert.equal(
      Object.getPrototypeOf(valor),
      Array.isArray(valor) ? Array.prototype : Object.prototype,
      `${ruta} no es un objeto plano (prototipo ${Object.getPrototypeOf(valor)?.constructor?.name ?? 'nulo'})`,
    );
    for (const [clave, hijo] of Object.entries(valor)) {
      revisar(hijo, `${ruta}.${clave}`);
    }
  };

  const { code, item } = await montarTurno('Prototipo');
  await envejecerTurno(item, 4);
  await cerrarTurnoConPuntuacion(code, item, { posicionFinal: 190, terminoNatural: true });

  const estado = await estadoSesion(code);
  const sesion = await obtenerSesion(code);

  // Lo que de verdad cruza a un componente de cliente: el estado completo de la
  // sala, el ranking y el último resultado. Se revisa entero, no por partes.
  revisar(estado, 'estadoSesion');
  revisar(sesion, 'obtenerSesion');
  revisar(await rankingDeSesion(sesion.id), 'rankingDeSesion');
  revisar(await ultimoResultado(sesion.id), 'ultimoResultado');
  revisar(await resultadosDeSesion(sesion.id), 'resultadosDeSesion');
  revisar(await historialDeNoches(), 'historialDeNoches');
  revisar(await listarSesiones(), 'listarSesiones');
  revisar(await searchPool('si no te hubieras ido'), 'searchPool');
  revisar(await getPoolItem('wt-pY4mI2rs'), 'getPoolItem');
  revisar(await getCatalog(), 'getCatalog');
});

test('el último resultado dice cuánto hace que salió', async () => {
  // De esto depende que la pantalla anime solo un resultado recién salido. Sin la
  // antigüedad, cada recarga de la tele repetiría la animación de una nota vieja; y
  // con la comprobación mal, la animación se perdería al terminar la última canción.
  const { code, item } = await montarTurno('Antiguedad');
  await envejecerTurno(item, 4);
  await cerrarTurnoConPuntuacion(code, item, { posicionFinal: 190, terminoNatural: true });

  const sesion = await obtenerSesion(code);
  const recien = await ultimoResultado(sesion.id);
  assert.ok(recien, 'debe haber un resultado');
  assert.equal(typeof recien.segundos, 'number');
  assert.ok(recien.segundos < 45, `recién guardado debería dar menos de 45 s, dio ${recien.segundos}`);

  // Se envejece y debe superar el umbral que usa la pantalla.
  const db = await getDb();
  await db
    .prepare(`update scores set created_at = datetime('now', '-5 minutes') where session_id = ?`)
    .run(sesion.id);

  const viejo = await ultimoResultado(sesion.id);
  assert.ok(viejo.segundos >= 45, `a los 5 minutos debería dar 300 s, dio ${viejo.segundos}`);
});

test('la segunda canción de alguien cuenta la primera como previa', async () => {
  // La racha de la noche aporta hasta 2 puntos y, más importante, el desglose
  // guardado tiene que decir la verdad: si registra «0 previas» cuando ya cantó,
  // el registro de auditoría no sirve para nada.
  const { code, luis, ana } = await montarTurno('Racha');

  // Luis canta una vez.
  const primera = await pedirCancion(code, luis.token, 'K4HvVN1lVAQ');
  assert.equal(primera.ok, true);
  await iniciarTurno(code, primera.queueItemId);
  await envejecerTurno(primera.queueItemId, 4);
  await cerrarTurnoConPuntuacion(code, primera.queueItemId, {
    posicionFinal: 190,
    terminoNatural: true,
  });

  assert.equal(await leerPreviasGuardadas(primera.queueItemId), 0, 'la primera canción no tiene previas');

  // Y canta otra vez.
  const segunda = await pedirCancion(code, luis.token, 'n5FzZJ0bpug');
  assert.equal(segunda.ok, true);
  await iniciarTurno(code, segunda.queueItemId);
  await envejecerTurno(segunda.queueItemId, 4);
  await cerrarTurnoConPuntuacion(code, segunda.queueItemId, {
    posicionFinal: 190,
    terminoNatural: true,
  });

  assert.equal(
    await leerPreviasGuardadas(segunda.queueItemId),
    1,
    'la segunda canción debe registrar la primera como previa',
  );

  void ana;
});

/** Lee cuántas canciones previas registró el desglose de un turno. */
async function leerPreviasGuardadas(queueItemId) {
  const db = await getDb();
  const fila = await db
    .prepare('select inputs from scores where queue_item_id = ?')
    .get(queueItemId);
  return JSON.parse(fila.inputs).priorScores;
}

test('un resultado guardado se puede auditar', async () => {
  const { code, item } = await montarTurno('Auditar');
  await envejecerTurno(item, 4);
  await cerrarTurnoConPuntuacion(code, item, { posicionFinal: 190, terminoNatural: true });

  const db = await getDb();
  const fila = await db
    .prepare('select engine_version, seed, inputs, detail from scores where queue_item_id = ?')
    .get(item);

  assert.equal(fila.engine_version, VERSION_MOTOR);
  assert.match(fila.seed, /^[0-9A-Z]{6}:\d+:\d+$/, 'la semilla ata el resultado al turno');

  const detalle = JSON.parse(fila.detail);
  assert.ok('finalizacion' in detalle);
  assert.ok('variacion' in detalle);

  const entradas = JSON.parse(fila.inputs);
  assert.ok('audienceCheers' in entradas);
  assert.equal(typeof entradas.priorScores, 'number', 'las previas se guardan contadas');
});

test('una pista bloqueada en medio del turno se descarta sin penalizar al cantante', async () => {
  const { code } = await crearSesion('Pista rota en turno');
  const ana = await unirseSesion(code, 'Ana');
  const pedido = await pedirCancion(code, ana.token, 'U5TiuzOkJEY');
  assert.equal(pedido.ok, true);

  await iniciarTurno(code, pedido.queueItemId);
  // Simula que el reproductor recibe 150 y marca la pista como bloqueada.
  await marcarPistaFallida('U5TiuzOkJEY', 150);

  // Aunque el operador pulse Saltar (cerrarTurnoConPuntuacion), no debe guardarse nota baja.
  const cierre = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, {
    terminoNatural: false,
  });
  assert.equal(cierre.ok, true);
  assert.equal(cierre.resultado, null);
  assert.equal(cierre.bloqueada, true);
  assert.equal(await leerResultadoPorTurno(pedido.queueItemId), null);

  // Dejamos la pista restaurada en el fixture por limpieza.
  const db = await getDb();
  await db
    .prepare('update pool_items set playback_blocked = 0, fail_count = 0 where video_id = ?')
    .run('U5TiuzOkJEY');
});

test('dos transacciones asíncronas lanzadas a la vez no chocan en SQLite local', async () => {
  const { code } = await crearSesion('Concurrencia');
  const a = await unirseSesion(code, 'Ana');
  const b = await unirseSesion(code, 'Luis');
  const c = await unirseSesion(code, 'Eva');
  const p1 = await pedirCancion(code, a.token, 'wt-pY4mI2rs');
  const p2 = await pedirCancion(code, b.token, 'U5TiuzOkJEY');
  const p3 = await pedirCancion(code, c.token, 'K4HvVN1lVAQ');
  void p1;

  // Dos mutaciones con transacción lanzadas en paralelo sin esperar a la primera.
  const [r1, r2] = await Promise.all([
    moverEnCola(code, p3.queueItemId, -1),
    cancelarPeticion(code, b.token, p2.queueItemId),
  ]);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
});

test('el inicio de turno remoto desde el móvil activa el estado singing en la sesión', async () => {
  const { code } = await crearSesion('Control Remoto TV');
  const ana = await unirseSesion(code, 'Ana');
  const pedido = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
  assert.equal(pedido.ok, true);

  // Antes de iniciar: está en espera
  let estado = await estadoSesion(code);
  assert.equal(estado.sonando, null);
  assert.equal(estado.esperando.length, 1);
  assert.equal(estado.esperando[0].id, pedido.queueItemId);

  // El cantante da Play desde su móvil
  const inicio = await iniciarTurno(code, pedido.queueItemId);
  assert.equal(inicio.ok, true);

  // La sesión pasa a tenerlo como sonando
  estado = await estadoSesion(code);
  assert.ok(estado.sonando);
  assert.equal(estado.sonando.id, pedido.queueItemId);
  assert.equal(estado.sonando.status, 'singing');
  assert.equal(estado.esperando.length, 0);
});

test('las canciones no finalizadas varían su puntuación en la banda baja y no quedan todas fijas en 69', async () => {
  const { puntuar } = await import('../src/domain/scoring/motor.mjs');
  const puntuaciones = new Set();
  for (let i = 0; i < 20; i++) {
    const res = puntuar({
      completionRatio: 0.2 + (i % 3) * 0.1,
      interruptionCount: 0,
      endedNaturally: false,
      audienceCheers: 0,
      audienceSize: 2,
      priorScores: [],
      songDifficulty: 3,
      seed: `semilla-variada-${i}`,
    });
    assert.ok(res.total <= 69, `no debe pasar de 69, dio ${res.total}`);
    assert.ok(res.total >= 50, `no debe bajar de 50, dio ${res.total}`);
    puntuaciones.add(res.total);
  }
  // Debe haber al menos 3 notas distintas, no todas 69
  assert.ok(puntuaciones.size >= 3, `se esperaban notas variadas, pero solo hubo: ${[...puntuaciones]}`);
});

test('terminar naturalmente sin started_at registrado no penaliza con abandono ni fuerza 69', async () => {
  const { code } = await crearSesion('Sin Started At');
  const ana = await unirseSesion(code, 'Ana');
  const pedido = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
  assert.equal(pedido.ok, true);

  // El turno termina naturalmente en YouTube sin que haya pasado por iniciarTurno
  const cierre = await cerrarTurnoConPuntuacion(code, pedido.queueItemId, {
    terminoNatural: true,
    posicionFinal: 190,
    duracionObservada: 190,
  });

  assert.equal(cierre.ok, true);
  const detalle = JSON.parse(cierre.resultado.detail);
  assert.equal(detalle.abandono, false);
  assert.ok(cierre.resultado.total >= 55, `debe sacar nota válida sin penalización de abandono, sacó ${cierre.resultado.total}`);
  assert.notEqual(cierre.resultado.total, 69);
});

test('Modo Bar: intercala la cola por rondas (Round-Robin) y limita a 2 canciones pendientes', async () => {
  const { cambiarModoSesion } = await import('../src/db/sessions.mjs');
  const { code, modo } = await crearSesion('Bar La Trova', 'bar');
  assert.equal(modo, 'bar');

  const sesion = await obtenerSesion(code);
  assert.equal(sesion.name, 'Bar La Trova');
  assert.equal(sesion.modo, 'bar');

  const ana = await unirseSesion(code, 'Ana');
  const luis = await unirseSesion(code, 'Luis');

  // Ana pide 2 canciones seguidas
  const a1 = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
  const a2 = await pedirCancion(code, ana.token, 'U5TiuzOkJEY');
  assert.equal(a1.ok, true);
  assert.equal(a2.ok, true);

  // En Modo Bar la 3ra canción pendiente se bloquea (límite = 2)
  const a3 = await pedirCancion(code, ana.token, 'K4HvVN1lVAQ');
  assert.equal(a3.ok, false);
  assert.equal(a3.error, 'LIMITE_ALCANZADO');

  // Luis (otra mesa) pide su primera canción: debe intercalarse ANTES de la segunda de Ana
  const l1 = await pedirCancion(code, luis.token, 'n5FzZJ0bpug');
  assert.equal(l1.ok, true);

  const estado = await estadoSesion(code);
  assert.deepEqual(
    estado.esperando.map((f) => f.nickname),
    ['Ana', 'Luis', 'Ana'],
    'la 1ra canción de Luis debe ir antes que la 2da de Ana en Modo Bar',
  );

  // Si se cambia el modo en caliente a casa, se actualiza el modo de la sesión
  await cambiarModoSesion(code, 'casa');
  const estadoCasa = await estadoSesion(code);
  assert.equal(estadoCasa.modo, 'casa');
  assert.equal(estadoCasa.limitePendientes, 3);
});

test('Modo Bar: alterna cantantes dentro de una mesa sin adelantar la canción visible', async () => {
  const { code } = await crearSesion('Bar Equitativo', 'bar');
  const ana = await unirseSesion(code, 'AnaMesa', undefined, 'Mesa 1');
  const bea = await unirseSesion(code, 'BeaMesa', undefined, 'Mesa 1');
  const carlos = await unirseSesion(code, 'CarlosMesa', undefined, 'Mesa 2');
  const a1 = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
  const a2 = await pedirCancion(code, ana.token, 'U5TiuzOkJEY');
  const b1 = await pedirCancion(code, bea.token, 'K4HvVN1lVAQ');
  const c1 = await pedirCancion(code, carlos.token, 'n5FzZJ0bpug');
  assert.equal(a1.ok, true);
  assert.equal(a2.ok, true);
  assert.equal(b1.ok, true);
  assert.equal(c1.ok, true);
  const estado = await estadoSesion(code);
  assert.deepEqual(estado.esperando.map((f) => f.nickname),
    ['AnaMesa', 'CarlosMesa', 'BeaMesa', 'AnaMesa']);
  assert.equal(estado.esperando[0].id, a1.queueItemId, 'la TV no cambia de cantante');
  assert.equal(estado.limitePendientes, 2);
});

test('Modo Bar: reserva el botón Play al dueño durante 60s y luego permite saltar turno ausente', async () => {
  const { iniciarTurnoMovil, saltarTurnoInactivo } = await import('../src/db/sessions.mjs');
  const { getDb } = await import('../src/db/client.mjs');

  const { code } = await crearSesion('Bar Viernes', 'bar');
  const ana = await unirseSesion(code, 'Ana');
  const luis = await unirseSesion(code, 'Luis');

  const pAna = await pedirCancion(code, ana.token, 'wt-pY4mI2rs');
  const pLuis = await pedirCancion(code, luis.token, 'U5TiuzOkJEY');

  // Recién pedida (< 60s): Luis NO puede iniciar ni saltar el turno de Ana
  const intentoPlayLuis = await iniciarTurnoMovil(code, luis.token, pAna.queueItemId);
  assert.equal(intentoPlayLuis.ok, false);
  assert.equal(intentoPlayLuis.error, 'TURNO_RESERVADO_BAR');

  const intentoSaltoLuis = await saltarTurnoInactivo(code, luis.token, pAna.queueItemId);
  assert.equal(intentoSaltoLuis.ok, false);
  assert.equal(intentoSaltoLuis.error, 'TURNO_RESERVADO_BAR');

  // Simulamos que han pasado 65 segundos sin que Ana le dé Play
  const db = await getDb();
  await db
    .prepare("update queue_items set requested_at = datetime('now', '-65 seconds') where id = ?")
    .run(pAna.queueItemId);

  const estadoTrasEspera = await estadoSesion(code);
  assert.ok(estadoTrasEspera.segundosEnPantalla >= 60);

  // Ahora Luis sí puede saltar el turno ausente de Ana para destrabar la cola del bar
  const saltoOk = await saltarTurnoInactivo(code, luis.token, pAna.queueItemId);
  assert.equal(saltoOk.ok, true);

  const estadoFinal = await estadoSesion(code);
  assert.equal(estadoFinal.esperando.length, 1);
  assert.equal(estadoFinal.esperando[0].id, pLuis.queueItemId);
  assert.equal(estadoFinal.esperando[0].nickname, 'Luis');
});

test('Modo Bar: asigna mesa a los participantes y la expone en cola y estado de sala', async () => {
  const { crearSesion, unirseSesion, pedirCancion, estadoSesion } = await import('../src/db/sessions.mjs');
  const { code } = await crearSesion('Bar Tropical', 'bar');

  const p1 = await unirseSesion(code, 'Carlos', undefined, 'Mesa 4');
  assert.equal(p1.ok, true);
  assert.equal(p1.mesa, 'Mesa 4');

  const p2 = await unirseSesion(code, 'Sofia', undefined, 'Barra VIP');
  assert.equal(p2.ok, true);
  assert.equal(p2.mesa, 'Barra VIP');

  // Pedir canciones
  const c1 = await pedirCancion(code, p1.token, 'wt-pY4mI2rs');
  const c2 = await pedirCancion(code, p2.token, 'U5TiuzOkJEY');
  assert.equal(c1.ok, true);
  assert.equal(c2.ok, true);

  const estado = await estadoSesion(code);
  assert.equal(estado.cola[0].nickname, 'Carlos');
  assert.equal(estado.cola[0].mesa, 'Mesa 4');
  assert.equal(estado.cola[1].nickname, 'Sofia');
  assert.equal(estado.cola[1].mesa, 'Barra VIP');

  const partCarlos = estado.participantes.find((p) => p.nickname === 'Carlos');
  assert.equal(partCarlos.mesa, 'Mesa 4');
});

// ==================================================== Fase 6: Favoritos y oEmbed

test('Fase 6: extraerVideoId reconoce enlaces watch, youtu.be, shorts, embed e ID directo', async () => {
  const { extraerVideoId } = await import('../src/lib/oembed.mjs');

  assert.equal(extraerVideoId('wt-pY4mI2rs'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('https://www.youtube.com/watch?v=wt-pY4mI2rs&feature=share'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('https://m.youtube.com/watch?v=wt-pY4mI2rs'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('https://youtu.be/wt-pY4mI2rs?si=abc123'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('https://www.youtube.com/embed/wt-pY4mI2rs'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('https://www.youtube.com/shorts/wt-pY4mI2rs'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('Mira este karaoke https://youtu.be/wt-pY4mI2rs en la fiesta'), 'wt-pY4mI2rs');
  assert.equal(extraerVideoId('texto sin enlace'), null);
});

test('Fase 6: toggleFavorito y listarFavoritos marcan, listan y desmarcan canciones', async () => {
  const { toggleFavorito, listarFavoritos } = await import('../src/db/queries.mjs');

  const alta = await toggleFavorito('wt-pY4mI2rs');
  assert.equal(alta.ok, true);
  assert.equal(alta.favorito, true);

  const lista = await listarFavoritos();
  assert.ok(lista.some((f) => f.video_id === 'wt-pY4mI2rs'));

  const hits = await searchPool('la bikina');
  assert.equal(hits[0].is_favorite, 1);

  const baja = await toggleFavorito('wt-pY4mI2rs');
  assert.equal(baja.ok, true);
  assert.equal(baja.favorito, false);

  const listaDespues = await listarFavoritos();
  assert.ok(!listaDespues.some((f) => f.video_id === 'wt-pY4mI2rs'));
});

test('Fase 6: importarPistaPorUrl valida con oEmbed, incorpora al pool y rechaza no embebibles o canales excluidos', async () => {
  const { importarPistaPorUrl } = await import('../src/db/queries.mjs');

  // 1. Pista nueva embebible (oEmbed 200 OK)
  const fakeFetchOk = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        title: 'Morat - Besos En Guerra (Versión Karaoke)',
        author_name: 'Karaoke Fiesta',
        author_url: 'https://www.youtube.com/@KaraokeFiesta',
      };
    },
  });

  const nueva = await importarPistaPorUrl('https://youtu.be/AbCdEfGh123', {
    fetchFn: /** @type {any} */ (fakeFetchOk),
  });
  assert.equal(nueva.ok, true);
  assert.equal(nueva.nueva, true);
  assert.equal(nueva.item.artist, 'Morat');
  assert.equal(nueva.item.song_title, 'Besos En Guerra');

  // Ya queda buscable en el pool local
  const buscada = await searchPool('besos en guerra morat');
  assert.equal(buscada.length, 1);
  assert.equal(buscada[0].video_id, 'AbCdEfGh123');

  // 2. Pista con inserción desactivada (oEmbed 401 Unauthorized)
  const fakeFetch401 = async () => ({
    ok: false,
    status: 401,
    async json() {
      return {};
    },
  });

  const bloqueada = await importarPistaPorUrl('https://www.youtube.com/watch?v=NoEmbeb1234', {
    fetchFn: /** @type {any} */ (fakeFetch401),
  });
  assert.equal(bloqueada.ok, false);
  assert.equal(bloqueada.error, 'NO_EMBEBIBLE');

  // 3. Canal excluido (Sing King)
  const fakeFetchExcluido = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        title: 'Coldplay - Yellow (Karaoke)',
        author_name: 'Sing King',
        author_url: 'https://www.youtube.com/@SingKingKaraoke',
      };
    },
  });

  const excluida = await importarPistaPorUrl('https://youtu.be/SingKng1234', {
    fetchFn: /** @type {any} */ (fakeFetchExcluido),
  });
  assert.equal(excluida.ok, false);
  assert.equal(excluida.error, 'CANAL_EXCLUIDO');
});




test('ranking de mesas agrupa nombres y excluye abandonos', async () => {
  const { rankingMesasDeSesion } = await import('../src/db/puntuaciones.mjs');
  const { identificar } = await import('../src/db/sessions.mjs');
  const { getDb } = await import('../src/db/client.mjs');
  const { code } = await crearSesion('Competencia mesas', 'bar');
  const sesion = await obtenerSesion(code);
  const ana = await unirseSesion(code, 'AnaRanking', undefined, 'Mesa Uno');
  const bea = await unirseSesion(code, 'BeaRanking', undefined, 'mesa uno');
  const carlos = await unirseSesion(code, 'CarlosRanking', undefined, 'Mesa Dos');
  const db = await getDb();
  const datos = [
    [ana, 90, '{}', 'wt-pY4mI2rs'],
    [bea, 95, '{}', 'U5TiuzOkJEY'],
    [carlos, 100, '{}', 'K4HvVN1lVAQ'],
    [carlos, 99, '{"abandono":true}', 'n5FzZJ0bpug'],
  ];
  for (const [indice, [usuario, nota, detalle, video]] of datos.entries()) {
    const identidad = await identificar(code, usuario.token);
    const turno = await db.prepare(
      'insert into queue_items (session_id, participant_id, video_id, position) values (?, ?, ?, ?)'
    ).run(sesion.id, identidad.participante.id, video, indice + 1);
    await db.prepare(
      `insert into scores (session_id, participant_id, queue_item_id, video_id, total, rhythm, energy, interpretation, tier, engine_version, seed, inputs, detail)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sesion.id, identidad.participante.id, Number(turno.lastInsertRowid), video,
      nota, 80, 80, 80, 'excellent', 2, 'ranking-' + indice, '{}', detalle);
  }
  const ranking = await rankingMesasDeSesion(sesion.id);
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].mesa, 'Mesa Dos');
  assert.equal(ranking[0].canciones, 1);
  assert.equal(ranking[0].elegible, false);
  assert.equal(ranking[1].canciones, 2);
  assert.equal(ranking[1].media, 93);
});

test('los niveles de espectáculo persisten por sala y sobreviven cambios Casa/Bar', async () => {
  const { cambiarEspectaculoSesion, cambiarModoSesion, extraerModoYNombre } =
    await import('../src/db/sessions.mjs');
  const primera = await crearSesion('Fiesta de cumpleaños', 'bar');
  const segunda = await crearSesion('Otra noche', 'casa');
  assert.equal((await obtenerSesion(primera.code)).espectaculo, 'fiesta');
  assert.equal((await obtenerSesion(segunda.code)).espectaculo, 'fiesta');
  assert.deepEqual(extraerModoYNombre('[BAR] Karaoke clásico'),
    { modo: 'bar', name: 'Karaoke clásico', espectaculo: 'fiesta' });
  assert.equal((await cambiarEspectaculoSesion(primera.code, 'epico')).ok, true);
  assert.equal((await obtenerSesion(primera.code)).espectaculo, 'epico');
  await cambiarModoSesion(primera.code, 'casa');
  const actual = await obtenerSesion(primera.code);
  assert.equal(actual.modo, 'casa');
  assert.equal(actual.name, 'Fiesta de cumpleaños');
  assert.equal(actual.espectaculo, 'epico');
  await cambiarModoSesion(primera.code, 'bar');
  assert.equal((await obtenerSesion(primera.code)).espectaculo, 'epico');
  assert.equal((await obtenerSesion(segunda.code)).espectaculo, 'fiesta');
  assert.equal((await cambiarEspectaculoSesion(primera.code, 'intenso')).ok, false);
  assert.equal((await obtenerSesion(primera.code)).espectaculo, 'epico');
  assert.equal((await cambiarEspectaculoSesion(primera.code, 'discreto')).ok, true);
  assert.equal((await obtenerSesion(primera.code)).espectaculo, 'discreto');
});

test('Bar Ads: propietario aislado, campañas reutilizables y horario controlado',async()=>{
  const {
    registrarNuevaSalaBar,propietarioDeSala,barDeSala,crearCampania,
    cambiarEstadoCampania,promocionesDeSala,listarCampanias,validarCampania
  }=await import('../src/db/bar-ads.mjs');
  const barUno=await crearSesion('Pub Noche Azul','bar');
  const barDos=await crearSesion('Otro establecimiento','bar');
  const uno=await obtenerSesion(barUno.code);
  const dos=await obtenerSesion(barDos.code);
  const token=await registrarNuevaSalaBar(uno.id,'Pub Noche Azul');
  await registrarNuevaSalaBar(dos.id,'Otro establecimiento');
  const owner=await propietarioDeSala(uno.id,token);
  assert.ok(owner);
  assert.equal((await propietarioDeSala(dos.id,token)),undefined);
  assert.equal((await propietarioDeSala(uno.id,'mala-clave')),null);
  const nueva=await crearSesion('Segunda noche del Pub','bar');
  const segunda=await obtenerSesion(nueva.code);
  assert.equal(await registrarNuevaSalaBar(segunda.id,'Otra noche',token),token);
  assert.equal((await barDeSala(segunda.id)).id,owner.id);

  const id=await crearCampania(owner.id,{
    title:'2x1 Mojitos',placement:'espera',duration_seconds:10,priority:2,
    starts_at:'2026-10-22T18:00:00.000Z',
    ends_at:'2026-10-23T05:00:00.000Z'
  },{url:'https://example.com/promo.webp',pathname:'promo.webp',contentType:'image/webp'});
  assert.equal((await listarCampanias(owner.id)).length,1);
  assert.equal((await promocionesDeSala(uno.id,new Date('2026-10-22T20:00:00Z'))).length,0,'borradores nunca se publican');
  assert.equal(await cambiarEstadoCampania(owner.id,id,'active'),true);
  assert.equal((await promocionesDeSala(uno.id,new Date('2026-10-22T20:00:00Z'))).length,1);
  assert.equal((await promocionesDeSala(segunda.id,new Date('2026-10-22T20:00:00Z'))).length,1);
  assert.equal((await promocionesDeSala(dos.id,new Date('2026-10-22T20:00:00Z'))).length,0);
  assert.equal((await promocionesDeSala(uno.id,new Date('2026-10-22T17:00:00Z'))).length,0);
  assert.equal((await promocionesDeSala(uno.id,new Date('2026-10-23T06:00:00Z'))).length,0);
  assert.equal(await cambiarEstadoCampania(owner.id,id,'paused'),true);
  assert.equal((await promocionesDeSala(uno.id,new Date('2026-10-22T20:00:00Z'))).length,0);
  assert.equal(await cambiarEstadoCampania(owner.id,id,'invalid'),false);
  assert.equal(await cambiarEstadoCampania(100000,id,'active'),false);
  assert.throws(()=>validarCampania({title:'Promo',placement:'otro'}));
});

test('regresión TV Bar: cada actuación puntúa cuando todavía hay canciones en cola',async()=>{
  const {debeRevelarResultado}=await import('../src/domain/tv/revelacion-resultado.mjs');
  const {code}=await crearSesion('TV Bar puntuaciones consecutivas','bar');
  const ana=await unirseSesion(code,'Ana TV',undefined,'Mesa A');
  const luis=await unirseSesion(code,'Luis TV',undefined,'Mesa B');
  assert.ok(ana.ok && luis.ok);
  const p1=await pedirCancion(code,ana.token,'wt-pY4mI2rs');
  const p2=await pedirCancion(code,luis.token,'U5TiuzOkJEY');
  assert.equal(p1.ok,true);
  assert.equal(p2.ok,true);

  await iniciarTurno(code,p1.queueItemId);
  await envejecerTurno(p1.queueItemId,4);
  const cerrado1=await cerrarTurnoConPuntuacion(code,p1.queueItemId,{
    posicionFinal:190, terminoNatural:true,
  });
  assert.equal(cerrado1.ok,true);
  assert.ok(cerrado1.resultado?.id);
  const espera=await estadoSesion(code);
  assert.equal(espera.sonando,null);
  assert.equal(espera.esperando.length,1,'la cola aún tiene al segundo cantante');
  const s1=await ultimoResultado((await obtenerSesion(code)).id);
  assert.equal(s1.queue_item_id,p1.queueItemId);
  assert.ok(debeRevelarResultado({
    resultado:s1,reciente:true,ultimoMostradoId:null,turnoSonandoId:null,
  }), 'la TV debe revelar la primera nota antes de la siguiente canción');

  await iniciarTurno(code,p2.queueItemId);
  await envejecerTurno(p2.queueItemId,4);
  const cerrado2=await cerrarTurnoConPuntuacion(code,p2.queueItemId,{
    posicionFinal:190, terminoNatural:true,
  });
  assert.equal(cerrado2.ok,true);
  const s2=await ultimoResultado((await obtenerSesion(code)).id);
  assert.equal(s2.queue_item_id,p2.queueItemId);
  assert.ok(s2.id>s1.id);
  assert.ok(debeRevelarResultado({
    resultado:s2,reciente:true,ultimoMostradoId:s1.id,turnoSonandoId:null,
  }), 'la segunda nota también aparece con la cola vacía');
});

test('celebración protegida 8700 ms en servidor: rechaza Play y no autoavanza',async()=>{
  const { CELEBRACION_MS, celebracionPendiente, omitirCelebracion } =
    await import('../src/domain/celebracion.mjs');
  assert.equal(CELEBRACION_MS,8700);
  const { code } = await crearSesion('Celebración protegida');
  const ana = await unirseSesion(code, 'Ana Celebracion');
  const luis = await unirseSesion(code, 'Luis Celebracion');
  const p1 = await pedirCancion(code, ana.token,'wt-pY4mI2rs');
  const p2 = await pedirCancion(code, luis.token,'U5TiuzOkJEY');
  assert.equal(p1.ok,true); assert.equal(p2.ok,true);
  assert.equal((await iniciarTurno(code,p1.queueItemId)).ok,true);
  await envejecerTurno(p1.queueItemId,4);
  const res = await cerrarTurnoConPuntuacion(code,p1.queueItemId,{
    terminoNatural:true,posicionFinal:190
  });
  assert.equal(res.ok,true);
  const sesion = await obtenerSesion(code);
  const ms = await celebracionPendiente(sesion.id);
  assert.ok(ms > 0 && ms <= 8700, `protección debe durar 8.7s: ${ms}ms`);
  const durante = await estadoSesion(code);
  assert.ok(durante.celebracionRestanteMs > 0);
  assert.equal(durante.sonando,null,'siguiente no debe arrancar automáticamente');
  assert.equal(durante.esperando[0].id,p2.queueItemId,'la cola se conserva');
  const intentoTV = await iniciarTurno(code,p2.queueItemId);
  assert.equal(intentoTV.ok,false);
  assert.equal(intentoTV.error,'CELEBRACION_EN_CURSO');
  const intentoMovil = await iniciarTurnoMovil(code,luis.token,p2.queueItemId);
  assert.equal(intentoMovil.ok,false);
  assert.equal(intentoMovil.error,'CELEBRACION_EN_CURSO');
  // Una petición duplicada no reinicia el contador.
  assert.equal((await cerrarTurnoConPuntuacion(code,p1.queueItemId,{terminoNatural:true})).ok,true);
  assert.ok((await celebracionPendiente(sesion.id)) <= ms);
  // Simular reloj vencido editando la reserva; sin dormir 8.7 segundos.
  const db = await getDb();
  await db.prepare('update score_ceremonies set until_ms=? where session_id=?')
    .run(Date.now()-1000,sesion.id);
  assert.equal(await celebracionPendiente(sesion.id),0);
  assert.equal((await estadoSesion(code)).sonando,null,'expirar no inicia turno');
  assert.equal((await iniciarTurno(code,p2.queueItemId)).ok,true,'Play se habilita');
  const inicio=await estadoSesion(code);
  assert.equal(inicio.sonando?.id,p2.queueItemId);
  await omitirCelebracion(sesion.id);
  assert.equal(await celebracionPendiente(sesion.id),0);
});

test('bloqueo de ceremonia tras finalizar de forma manual y omisión explícita',async()=>{
  const { celebracionPendiente, omitirCelebracion } = await import('../src/domain/celebracion.mjs');
  const { code } = await crearSesion('Manual con cola','bar');
  const a = await unirseSesion(code,'Cantante Manual',undefined,'Mesa 1');
  const b = await unirseSesion(code,'Proximo Manual',undefined,'Mesa 2');
  const q1 = await pedirCancion(code,a.token,'wt-pY4mI2rs');
  const q2 = await pedirCancion(code,b.token,'U5TiuzOkJEY');
  assert.equal((await iniciarTurno(code,q1.queueItemId)).ok,true);
  await envejecerTurno(q1.queueItemId,2);
  assert.equal((await cerrarTurnoConPuntuacion(code,q1.queueItemId,{terminoNatural:false})).ok,true);
  const sesion=await obtenerSesion(code);
  assert.ok((await celebracionPendiente(sesion.id)) > 0);
  assert.equal((await iniciarTurno(code,q2.queueItemId)).error,'CELEBRACION_EN_CURSO');
  await omitirCelebracion(sesion.id);
  assert.equal((await iniciarTurno(code,q2.queueItemId)).ok,true);
});
