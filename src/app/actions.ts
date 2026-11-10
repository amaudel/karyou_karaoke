'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { obtenerSesion, normalizarCodigo } from '@/db/sessions.mjs';
import { cookiePropietarioSala, esPropietarioSala } from '@/db/session-owners.mjs';
import { tvCookieName, verifyTvToken } from '@/db/tv-access.mjs';
import { consumirLimite } from '@/db/rate-limit.mjs';
import { createHash } from 'node:crypto';

async function limitarCatalogo(accion: string, maximo: number) {
  // Cabecera controlada por Vercel; fuera de Vercel usamos un cupo compartido conservador.
  const ip = (await headers()).get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip';
  const clave = createHash('sha256').update(ip).digest('hex').slice(0, 24);
  return consumirLimite(`catalogo:${accion}:${clave}`, maximo, 3600);
}

import { revalidatePath } from 'next/cache';
import {
  addToCatalog,
  marcarPistaFallida,
  toggleFavorito,
  importarPistaPorUrl,
} from '@/db/queries.mjs';

/**
 * Agrega una pista del pool al catálogo.
 *
 * Si la canción ya existe (mismo título y artista normalizados) añade una versión
 * más en lugar de crear una canción duplicada.
 */
export async function agregarAlCatalogo(formData: FormData) {
  const videoId = String(formData.get('videoId') ?? '').trim();
  if (!videoId) return;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    // Segunda línea de defensa: el videoId viene del formulario, no de la URL.
    console.warn('videoId con formato inválido:', videoId);
    return;
  }

  if (!(await limitarCatalogo('agregar', 30))) return;
  await addToCatalog(videoId);
  revalidatePath('/catalogo');
  revalidatePath('/');
}

/**
 * Alterna si una canción está en Favoritos desde el catálogo.
 */
export async function toggleFavoritoCatalogoAction(formData: FormData) {
  const videoId = String(formData.get('videoId') ?? '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;

  if (!(await limitarCatalogo('favoritos', 60))) return;
  await toggleFavorito(videoId);
  revalidatePath('/catalogo');
  revalidatePath('/');
}

/**
 * Importa una canción por URL o ID de YouTube usando oEmbed, la añade al pool
 * y la guarda automáticamente en el catálogo.
 */
export async function importarUrlCatalogoAction(formData: FormData) {
  const url = String(formData.get('url') ?? '').trim();
  if (!url) {
    redirect('/catalogo?aviso=URL_INVALIDA');
  }

  if (!(await limitarCatalogo('importar', 10))) {
    redirect('/catalogo?aviso=LIMITE_SOLICITUDES');
  }
  const res = await importarPistaPorUrl(url);
  if (!res.ok) {
    redirect(`/catalogo?aviso=${encodeURIComponent(res.error)}`);
  }

  await addToCatalog(res.videoId);
  revalidatePath('/catalogo');
  revalidatePath('/');
  redirect(`/catalogo?importada=${encodeURIComponent(res.videoId)}`);
}

/**
 * Registra que una pista no se pudo reproducir.
 *
 * Se llama desde el reproductor cuando YouTube responde 101 o 150, que significan
 * «el titular de los derechos no permite insertar este video». Es la única forma de
 * detectarlo: la API de datos marca esos videos como `embeddable = true`.
 *
 * El efecto es que la pista deja de ofrecerse y el contador de «bloqueadas» sube,
 * que es el dato que no se puede saber de antemano.
 */
export async function reportarPistaBloqueada(code: string, videoId: string, codigo: number) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
  if (codigo !== 101 && codigo !== 150) return;
  const limpio = normalizarCodigo(code);
  const sesion = await obtenerSesion(limpio);
  if (!sesion) return;
  const jar = await cookies();
  const propietario = await esPropietarioSala(
    sesion.id,
    jar.get(cookiePropietarioSala(limpio))?.value,
    jar.get('karyou_bar_owner')?.value,
  );
  if (!propietario && !(await verifyTvToken(sesion.id, jar.get(tvCookieName(limpio))?.value))) return;
  // Un reporte por video y sala cada 10 minutos. La TV no puede vaciar el catálogo
  // mediante repeticiones, y el límite persiste entre instancias serverless.
  if (!(await consumirLimite(`yt-block:${sesion.id}:${videoId}`, 1, 600))) return;
  const resultado = await marcarPistaFallida(videoId, codigo);
  if (resultado.ocultada) {
    revalidatePath('/catalogo');
    revalidatePath('/');
  }
}
