/**
 * Los 30 videos verificados el 2026-09-15 con oEmbed.
 *
 * Cómo se verificaron: se pidió https://www.youtube.com/oembed?url=...&format=json
 * para cada candidato de los dos informes de investigación. oEmbed devuelve 200 si el
 * video existe Y es embebible, 401 si existe pero no se puede insertar, y 404 si no
 * existe. Los 3 que fallaron (2 de Sing King, 1 de Party Tyme) quedaron fuera.
 *
 * De 33 candidatos: 30 embebibles (91%).
 *
 * Cuando se importen los canales completos (Fase 2) esto pasa a ser un detalle
 * histórico: el pool real lo llena el importador. Se conserva como semilla para
 * tener algo que buscar antes de tener la API key.
 */

export const CHANNELS = [
  {
    handle: '@partytymekaraokeenespanol7262',
    name: 'PARTY TYME KARAOKE EN ESPAÑOL',
    tier: 2,
  },
  { handle: '@EchoeEntertainment', name: 'Echoe Entertainment', tier: 2 },
  { handle: '@KaraokeMediaPlus', name: 'KaraokeMedia', tier: 2 },
  { handle: '@OficialMana', name: 'OficialMana', tier: 1 },
  { handle: '@muramatsukaraoke', name: 'Muramatsu Karaoke', tier: 3 },
  { handle: '@ChansonKaraoke', name: 'Chanson Karaoke', tier: 3 },
  { handle: '@humbert_mendoza', name: 'Humbert_Mendoza', tier: 3 },
  { handle: '@joseca7', name: 'Karaoke Joseca - Ecuador', tier: 3 },
  { handle: '@fredycarlostroya', name: 'FREDY TROYA', tier: 3 },
  { handle: '@alejandroriofrio6571', name: 'Alejandro Riofrio', tier: 3 },
  { handle: '@VideoMundial', name: 'Video Mundial', tier: 4 },
  { handle: '@MarioMolekulas', name: 'Mario Molekulas', tier: 4 },
  {
    handle: null,
    name: 'Sing King',
    tier: 3,
    excluded: 1,
    excludedNote:
      'Embedding desactivado. De 2 videos probados, 0 fueron embebibles (HTTP 401 en oEmbed). ' +
      'Es una operación comercial que protege su propia app.',
  },
];

/**
 * videoId, canal, título real devuelto por oEmbed, y artista/canción separados.
 * @type {Array<{videoId: string, handle: string, videoTitle: string, artist: string, songTitle: string}>}
 */
export const POOL_ITEMS = [
  // ---- PARTY TYME KARAOKE EN ESPAÑOL (20 de 21 probados) ----
  { videoId: 'wt-pY4mI2rs', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Luis Miguel - La Bikina (Versión Karaoke)', artist: 'Luis Miguel', songTitle: 'La Bikina' },
  { videoId: 'rfwVxgkx_Q8', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Juan Gabriel - Hasta Que Te Conoci (Versión Karaoke)', artist: 'Juan Gabriel', songTitle: 'Hasta Que Te Conocí' },
  { videoId: 'K4HvVN1lVAQ', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Vicente Fernandez - Estos Celos (Versión Karaoke)', artist: 'Vicente Fernández', songTitle: 'Estos Celos' },
  { videoId: 'n5FzZJ0bpug', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Marco Antonio Solis - Si No Te Hubieras Ido (Versión Karaoke)', artist: 'Marco Antonio Solís', songTitle: 'Si No Te Hubieras Ido' },
  { videoId: 'vNfNjG5Q6FU', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Juan Gabriel - Querida (Versión Karaoke)', artist: 'Juan Gabriel', songTitle: 'Querida' },
  { videoId: 'U5TiuzOkJEY', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Mana - Rayando El Sol (Versión Karaoke)', artist: 'Maná', songTitle: 'Rayando El Sol' },
  { videoId: '9mAr1eDTRvo', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Marc Anthony - Ahora Quien (Versión Karaoke)', artist: 'Marc Anthony', songTitle: 'Ahora Quién' },
  { videoId: 'QThJlC1W5hQ', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Luis Fonsi ft. Daddy Yankee - Despacito (Versión Karaoke)', artist: 'Luis Fonsi ft. Daddy Yankee', songTitle: 'Despacito' },
  { videoId: '753dfvomgf4', handle: '@partytymekaraokeenespanol7262', videoTitle: 'KAROL G - Provenza (Versión Karaoke)', artist: 'KAROL G', songTitle: 'Provenza' },
  { videoId: 'wFR0lF24IZ4', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Luis Miguel - La Barca (Versión Karaoke)', artist: 'Luis Miguel', songTitle: 'La Barca' },
  { videoId: 'IuNKijgr_xQ', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Luis Miguel - Isabel (Versión Karaoke)', artist: 'Luis Miguel', songTitle: 'Isabel' },
  { videoId: 'z_mEpL_zl8k', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Rocio Durcal - Ya Te Olvide (Versión Karaoke)', artist: 'Rocío Dúrcal', songTitle: 'Ya Te Olvidé' },
  { videoId: 'pSCHrgQcUSw', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Rocio Durcal - De Serenata (Versión Karaoke)', artist: 'Rocío Dúrcal', songTitle: 'De Serenata' },
  { videoId: 'q9mxcGGjats', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Rocio Durcal - Como Tu Mujer (Versión Karaoke)', artist: 'Rocío Dúrcal', songTitle: 'Como Tu Mujer' },
  { videoId: 'ov-2IoQ1LTI', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Ana Gabriel - Luna (Versión Karaoke)', artist: 'Ana Gabriel', songTitle: 'Luna' },
  { videoId: 'z9aZ5vLU_UE', handle: '@partytymekaraokeenespanol7262', videoTitle: 'La Sonora Dinamita - Que Bello (Versión Karaoke)', artist: 'La Sonora Dinamita', songTitle: 'Que Bello' },
  { videoId: 'Xkhcws7P204', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Amanda Miguel - El Me Mintio (Versión Karaoke)', artist: 'Amanda Miguel', songTitle: 'Él Me Mintió' },
  { videoId: 'xauFGEqElHM', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Myriam Hernandez - Huele A Peligro (Versión Karaoke)', artist: 'Myriam Hernández', songTitle: 'Huele A Peligro' },
  { videoId: 'cgczVlz2usI', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Pandora - Como Te Va Mi Amor (Versión Karaoke)', artist: 'Pandora', songTitle: 'Como Te Va Mi Amor' },
  { videoId: 's6MECNPPgIo', handle: '@partytymekaraokeenespanol7262', videoTitle: 'Ana Gabriel - Simplemente Amigos (Versión Karaoke)', artist: 'Ana Gabriel', songTitle: 'Simplemente Amigos' },

  // ---- Echoe Entertainment (4 de 4) ----
  { videoId: 'r9DJTBU7RbE', handle: '@EchoeEntertainment', videoTitle: 'Shakira - Suerte (Versión Karaoke)', artist: 'Shakira', songTitle: 'Suerte' },
  { videoId: 'iM32wVU0TnI', handle: '@EchoeEntertainment', videoTitle: 'Shakira - Loba (Versión Karaoke)', artist: 'Shakira', songTitle: 'Loba' },
  { videoId: 'kv7iRaVpXYA', handle: '@EchoeEntertainment', videoTitle: 'Shakira - Las De La Intuición (Versión Karaoke)', artist: 'Shakira', songTitle: 'Las De La Intuición' },
  { videoId: 'lay5lTxgt7o', handle: '@EchoeEntertainment', videoTitle: 'Shakira - Si Te Vas (Versión Karaoke)', artist: 'Shakira', songTitle: 'Si Te Vas' },

  // ---- OficialMana (1 de 1) ----
  // Misma canción que U5TiuzOkJEY pero de otra fuente: al agregarla al catálogo
  // debe quedar como SEGUNDA versión de "Maná - Rayando El Sol", no como canción nueva.
  { videoId: 'QJaQd525CNM', handle: '@OficialMana', videoTitle: 'Maná - Rayando El Sol (feat. Pablo Alborán) (Karaoke Oficial)', artist: 'Maná', songTitle: 'Rayando El Sol' },

  // ---- KaraokeMedia (1 de 1) ----
  { videoId: '3RlxPnj4SPY', handle: '@KaraokeMediaPlus', videoTitle: 'Daddy Yankee - Gasolina (KARAOKE) [Instrumental y letra]', artist: 'Daddy Yankee', songTitle: 'Gasolina' },

  // ---- Especializados ----
  { videoId: 'AfRM34GiYVM', handle: '@muramatsukaraoke', videoTitle: 'Anitta & J Balvin - Downtown (Karaoke Version) [Español] (Instrumental) (Cover)', artist: 'Anitta & J Balvin', songTitle: 'Downtown' },
  { videoId: 'bhwXDj8f6b0', handle: '@ChansonKaraoke', videoTitle: '🔥 Si Vuelvo a Nacer - Bia (Karaoke Version) (Español) (Cover)', artist: 'Bia', songTitle: 'Si Vuelvo a Nacer' },
  { videoId: 'k1M3eyjLPrQ', handle: '@VideoMundial', videoTitle: 'Daddy Yankee - Rompe (Instrumental Beat Karaoke)', artist: 'Daddy Yankee', songTitle: 'Rompe' },
  { videoId: 'MxeO1yHfx-k', handle: '@MarioMolekulas', videoTitle: 'José Augusto - Evidencias Karaoke (Versión Español)', artist: 'José Augusto', songTitle: 'Evidencias' },
];
