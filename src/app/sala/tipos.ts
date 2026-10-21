/**
 * Forma de los datos de sesión que consumen las pantallas.
 *
 * Existe porque el módulo de sesiones está en `.mjs` con anotaciones JSDoc, y
 * TypeScript no propaga los `@typedef` de ese archivo a los componentes `.tsx`:
 * las propiedades llegan como `any` y los callbacks dan error de tipo implícito.
 *
 * Se declara aquí, junto a quien lo usa, en lugar de forzar `checkJs` en todo el
 * proyecto: activarlo añadía decenas de errores de ruido de `node:sqlite` sin
 * resolver este problema.
 *
 * Si el módulo se migra a TypeScript, este archivo se borra.
 */

/** Campos de una fila de la cola que se pintan en pantalla. */
export type FilaVista = {
  id: number;
  position: number;
  status: string;
  video_id: string;
  participant_id: number;
  nickname: string;
  song_title: string;
  video_title: string;
  artist: string;
  duration_seconds: number | null;
  channel_name: string | null;
};

/** Un participante de la sala. */
export type ParticipanteVista = {
  id: number;
  nickname: string;
};

/** Lo que devuelve `estadoSesion`. */
export type EstadoVista = {
  modo: 'casa' | 'bar';
  limitePendientes: number;
  segundosEnPantalla: number;
  sonando: FilaVista | null;
  esperando: FilaVista[];
  cola: FilaVista[];
  participantes: ParticipanteVista[];
};

/** Lo que devuelve `unirseSesion`. */
export type ResultadoAlta =
  | { ok: true; participantId: number; token: string; nickname: string }
  | { ok: false; error: string };

/** Un resultado ya calculado, para pintarlo. */
export type ResultadoVista = {
  id: number;
  participant_id: number;
  queue_item_id: number;
  nickname: string;
  song_title: string;
  artist: string;
  total: number;
  rhythm: number;
  energy: number;
  interpretation: number;
  tier: string;
};

/** Una fila del ranking. */
export type FilaRankingVista = {
  participant_id: number;
  nickname: string;
  mejor: number;
  media: number;
  canciones: number;
  posicion: number;
};
