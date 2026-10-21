'use server';

import { redirect } from 'next/navigation';
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
export async function reportarPistaBloqueada(videoId: string, codigo: number) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return;
  if (!Number.isInteger(codigo)) return;

  const resultado = await marcarPistaFallida(videoId, codigo);
  if (resultado.ocultada) {
    revalidatePath('/catalogo');
    revalidatePath('/');
  }
}
