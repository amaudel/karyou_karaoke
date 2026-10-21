/**
 * Utilidades para importar canciones sueltas por URL o ID de YouTube usando oEmbed.
 *
 * No requiere clave de API de YouTube ni consume cuota diaria:
 * - Extrae el `videoId` de cualquier enlace de YouTube (watch, youtu.be, shorts, embed)
 * - Consulta `https://www.youtube.com/oembed`
 * - Si responde 200 OK, confirma que el video existe y es embebible (401/403 = no embebible)
 */

const PATRON_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extrae el ID de 11 caracteres de un enlace de YouTube o texto compartido.
 *
 * Soporta:
 *   - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   - https://m.youtube.com/watch?v=dQw4w9WgXcQ
 *   - https://youtu.be/dQw4w9WgXcQ?si=...
 *   - https://www.youtube.com/embed/dQw4w9WgXcQ
 *   - https://www.youtube.com/shorts/dQw4w9WgXcQ
 *   - dQw4w9WgXcQ (ID directo)
 *
 * @param {string | null | undefined} entrada
 * @returns {string | null}
 */
export function extraerVideoId(entrada) {
  const texto = String(entrada ?? '').trim();
  if (!texto) return null;

  if (PATRON_ID.test(texto)) {
    return texto;
  }

  // Si el usuario pegó un texto compartido desde la app móvil ("Mira este karaoke https://youtu.be/...")
  const urlMatch = texto.match(/https?:\/\/[^\s]+/i);
  const candidato = urlMatch ? urlMatch[0] : texto;

  try {
    const conProtocolo = /^https?:\/\//i.test(candidato) ? candidato : `https://${candidato}`;
    const url = new URL(conProtocolo);
    const host = url.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return PATRON_ID.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && PATRON_ID.test(v)) return v;

      const partes = url.pathname.split('/').filter(Boolean);
      if (
        partes.length >= 2 &&
        ['embed', 'shorts', 'live', 'v'].includes(partes[0].toLowerCase()) &&
        PATRON_ID.test(partes[1])
      ) {
        return partes[1];
      }
    }
  } catch {
    // Fallback por expresión regular si la URL viene incompleta
  }

  const regex = /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/;
  const m = texto.match(regex);
  return m && PATRON_ID.test(m[1]) ? m[1] : null;
}

/**
 * Extrae el `@handle` de un `author_url` devuelto por oEmbed si está disponible.
 * Ejemplo: "https://www.youtube.com/@KaraokeMediaPlus" -> "@KaraokeMediaPlus"
 *
 * @param {string | null | undefined} authorUrl
 * @returns {string | null}
 */
export function extraerHandleDeUrl(authorUrl) {
  const texto = String(authorUrl ?? '').trim();
  if (!texto) return null;
  const m = texto.match(/\/(@[A-Za-z0-9_.-]+)/);
  return m ? m[1] : null;
}

/**
 * Consulta el endpoint público oEmbed de YouTube para validar si un video existe
 * y permite ser insertado (embebible), además de obtener su título y canal.
 *
 * @param {string} videoId
 * @param {typeof fetch} [fetchFn=fetch]
 * @returns {Promise<
 *   | { ok: true, videoId: string, title: string, channelName: string, channelHandle: string | null }
 *   | { ok: false, error: 'VIDEO_ID_INVALIDO' | 'NO_EMBEBIBLE' | 'VIDEO_NO_EXISTE' | 'ERROR_OEMBED' }
 * >}
 */
export async function consultarOEmbed(videoId, fetchFn = fetch) {
  if (!PATRON_ID.test(String(videoId ?? ''))) {
    return { ok: false, error: 'VIDEO_ID_INVALIDO' };
  }

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

  let res;
  try {
    res = await fetchFn(oembedUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, error: 'ERROR_OEMBED' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'NO_EMBEBIBLE' };
  }
  if (res.status === 404 || res.status === 400) {
    return { ok: false, error: 'VIDEO_NO_EXISTE' };
  }
  if (!res.ok) {
    return { ok: false, error: 'ERROR_OEMBED' };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'ERROR_OEMBED' };
  }

  const title = String(data?.title ?? '').trim();
  const channelName = String(data?.author_name ?? '').trim() || 'YouTube Karaoke';
  const channelHandle = extraerHandleDeUrl(data?.author_url);

  if (!title) {
    return { ok: false, error: 'VIDEO_NO_EXISTE' };
  }

  return {
    ok: true,
    videoId,
    title,
    channelName,
    channelHandle,
  };
}
