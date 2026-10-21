/**
 * Normalización de texto para búsqueda tolerante.
 *
 * Es la pieza de la que depende toda la búsqueda: si el texto guardado y el texto
 * buscado no pasan por aquí, la búsqueda falla. Por eso vive en un solo archivo y
 * lo usan tanto el script de carga como la aplicación.
 *
 *   Maná        -> mana
 *   José José   -> jose jose
 *   AC/DC       -> ac dc
 *   Ñandú       -> nandu
 *   Beyoncé     -> beyonce
 *
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')                     // separa la letra del acento
    .replace(/[\u0300-\u036f]/g, '')      // elimina los acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')          // todo lo demás -> espacio (quita ñ? no: ñ ya es n)
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Campos normalizados derivados de un título de video de YouTube.
 *
 * Los títulos siguen casi siempre el patrón "Artista - Canción (Versión Karaoke)".
 * Si no se puede separar, se guarda el título completo como canción y el artista
 * queda vacío; la búsqueda sigue funcionando porque el blob incluye todo.
 *
 * @param {string} videoTitle
 * @param {{ artist?: string | null, songTitle?: string | null }} [override]
 */
export function deriveFields(videoTitle, override = {}) {
  let artist = override.artist ?? null;
  let songTitle = override.songTitle ?? null;

  if (!artist || !songTitle) {
    const cleaned = String(videoTitle ?? '')
      // Sufijos que no forman parte del nombre de la canción.
      .replace(/\((?:versi[oó]n\s+)?karaoke[^)]*\)/gi, '')
      .replace(/\[(?:karaoke|instrumental)[^\]]*\]/gi, '')
      .replace(/\bkaraoke\b/gi, '')
      .replace(/\binstrumental\b/gi, '')
      .replace(/\bcover\b/gi, '')
      .replace(/[🔥🎤🎵]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const parts = cleaned.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
      if (!artist) artist = (parts[0] ?? '').trim();
      if (!songTitle) songTitle = parts.slice(1).join(' - ').trim();
    } else {
      if (!artist) artist = '';
      if (!songTitle) songTitle = cleaned;
    }
  }

  const artistNorm = normalize(artist);
  const titleNorm = normalize(songTitle);
  const searchBlob = `${artistNorm} ${titleNorm}`.trim();

  return {
    artist: artist || '',
    songTitle: songTitle || '',
    artistNorm,
    titleNorm,
    searchBlob,
  };
}

/**
 * Parte una consulta en tokens normalizados, descartando los vacíos.
 * @param {string} query
 * @returns {string[]}
 */
export function queryTokens(query) {
  return normalize(query).split(' ').filter(Boolean);
}
