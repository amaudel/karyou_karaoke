'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  normalizarCodigo,
  crearSesion,
  obtenerSesion,
  unirseSesion,
  pedirCancion,
  cancelarPeticion,
  iniciarTurno,
  iniciarTurnoMovil,
  saltarTurnoInactivo,
  cerrarTurno,
  moverEnCola,
  cambiarEstadoSesion,
  cambiarModoSesion,
  cambiarEspectaculoSesion,
} from '@/db/sessions.mjs';
import { cerrarTurnoConPuntuacion, aplaudir } from '@/db/puntuaciones.mjs';
import { toggleFavorito, importarPistaPorUrl } from '@/db/queries.mjs';

/** Nombre de la cookie con la que un invitado se identifica en una sala. */
function nombreCookie(code: string) {
  return `p_${code}`;
}

/** El token del invitado para esta sala, si lo tiene. */
async function tokenDe(code: string): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(nombreCookie(code))?.value;
}

/* ------------------------------------------------------------------ crear */

export async function crearSesionAction(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const modoRaw = String(formData.get('modo') ?? 'casa');
  const modo = modoRaw === 'bar' ? 'bar' : 'casa';
  const porDefecto = modo === 'bar' ? 'Karaoke Bar' : 'Karaoke en casa';
  const { code } = await crearSesion(nombre || porDefecto, modo);

  revalidatePath('/');
  // Se abre directamente la pantalla de TV: es lo primero que hace falta.
  redirect(`/sala/${code}/tv`);
}

/* ------------------------------------------------------------------ entrar */

export async function unirseAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const apodo = String(formData.get('apodo') ?? '').trim();
  const mesa = String(formData.get('mesa') ?? '').trim();

  const sesion = await obtenerSesion(code);
  if (sesion?.modo === 'bar' && !mesa) {
    redirect(`/sala/${code}?error=MESA_REQUERIDA`);
  }

  const tokenActual = await tokenDe(code);
  const res = await unirseSesion(code, apodo, tokenActual, mesa || undefined);
  if (!res.ok) {
    redirect(`/sala/${code}?error=${encodeURIComponent(res.error)}`);
  }

  const jar = await cookies();
  jar.set(nombreCookie(code), res.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Persistencia completa durante la sesión de karaoke (24 horas)
    maxAge: 60 * 60 * 24,
  });

  revalidatePath(`/sala/${code}`);
  redirect(`/sala/${code}`);
}

/* ------------------------------------------------------------------- cola */

function anexarError(volver: string, error: string) {
  const limpio = volver.replace(/^\?/, '');
  return limpio
    ? `?error=${encodeURIComponent(error)}&${limpio}`
    : `?error=${encodeURIComponent(error)}`;
}

export async function pedirAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const videoId = String(formData.get('videoId') ?? '');
  const volver = String(formData.get('volver') ?? '');

  const token = await tokenDe(code);
  const res = await pedirCancion(code, token, videoId);

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);

  if (!res.ok) {
    redirect(`/sala/${code}${anexarError(volver, res.error)}`);
  }
  redirect(`/sala/${code}${volver}`);
}

/**
 * Alterna si una canción está en Favoritos desde el móvil de la sala.
 */
export async function toggleFavoritoSalaAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const videoId = String(formData.get('videoId') ?? '');
  const volver = String(formData.get('volver') ?? '');

  await toggleFavorito(videoId);

  revalidatePath(`/sala/${code}`);
  revalidatePath('/catalogo');
  redirect(`/sala/${code}${volver}`);
}

/**
 * Importa una canción por enlace o ID de YouTube usando oEmbed, la añade al pool
 * y la mete directo en la cola de turnos del cantante.
 */
export async function pedirPorUrlAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const url = String(formData.get('url') ?? '').trim();
  const volver = String(formData.get('volver') ?? '');

  const importada = await importarPistaPorUrl(url);
  if (!importada.ok) {
    redirect(`/sala/${code}${anexarError(volver, importada.error)}`);
  }

  const token = await tokenDe(code);
  const res = await pedirCancion(code, token, importada.videoId);

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  revalidatePath('/catalogo');

  if (!res.ok) {
    redirect(`/sala/${code}${anexarError(volver, res.error)}`);
  }
  redirect(`/sala/${code}`);
}

export async function cancelarAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const queueItemId = Number(formData.get('queueItemId'));

  const token = await tokenDe(code);
  await cancelarPeticion(code, token, queueItemId);

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(`/sala/${code}`);
}

/* ---------------------------------------------------- controles de la pantalla */

export async function iniciarTurnoAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  await iniciarTurno(code, Number(formData.get('queueItemId')));

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(formData.get('origen') === 'control' ? `/sala/${code}/control` : `/sala/${code}/tv`);
}

/** Inicia el turno desde el móvil del cantante sin redirigir a la TV */
export async function iniciarTurnoMovilAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const token = await tokenDe(code);
  const res = await iniciarTurnoMovil(code, token, Number(formData.get('queueItemId')));

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  if (!res.ok) {
    redirect(`/sala/${code}?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/sala/${code}`);
}

/** Salta un turno en espera cuando el cantante no aparece (Modo Bar tras 60s o Modo Casa) */
export async function saltarTurnoInactivoMovilAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const token = await tokenDe(code);
  const res = await saltarTurnoInactivo(code, token, Number(formData.get('queueItemId')));

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  if (!res.ok) {
    redirect(`/sala/${code}?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/sala/${code}`);
}

/** Cierra el turno desde el móvil del cantante sin redirigir a la TV */
export async function terminarTurnoMovilAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const queueItemId = Number(formData.get('queueItemId'));
  await cerrarTurnoConPuntuacion(code, queueItemId, { terminoNatural: false });

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(`/sala/${code}`);
}

export async function cerrarTurnoAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const queueItemId = Number(formData.get('queueItemId'));

  // Un cierre manual —el operador salta o corta— también produce nota. Si no,
  // quien abandona desaparecería del ranking en vez de sacar la nota baja que le
  // corresponde, y la banda baja de la distribución quedaría vacía.
  //
  // Sin telemetría del cliente, el servidor calcula el avance con su propio reloj.
  await cerrarTurnoConPuntuacion(code, queueItemId, { terminoNatural: false });

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(formData.get('origen') === 'control' ? `/sala/${code}/control` : `/sala/${code}/tv`);
}

/** Aplaude el turno que está sonando. Lo llama el móvil de un invitado. */
export async function aplaudirAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const token = await tokenDe(code);

  await aplaudir(code, token, Number(formData.get('queueItemId')));

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(`/sala/${code}`);
}

export async function moverAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const direccion = Number(formData.get('direccion')) === -1 ? -1 : 1;
  await moverEnCola(code, Number(formData.get('queueItemId')), direccion);

  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(formData.get('origen') === 'control' ? `/sala/${code}/control` : `/sala/${code}/tv`);
}

export async function cambiarModoSesionAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const modo = String(formData.get('modo') ?? 'casa') === 'bar' ? 'bar' : 'casa';
  await cambiarModoSesion(code, modo);

  revalidatePath('/');
  revalidatePath(`/sala/${code}`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(formData.get('origen') === 'control' ? `/sala/${code}/control` : `/sala/${code}/tv`);
}

export async function cambiarEspectaculoAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  const nivel = String(formData.get('espectaculo') ?? '');
  await cambiarEspectaculoSesion(code, nivel);
  revalidatePath(`/sala/${code}/control`);
  revalidatePath(`/sala/${code}/tv`);
  redirect(`/sala/${code}/control`);
}

export async function terminarSesionAction(formData: FormData) {
  const code = normalizarCodigo(String(formData.get('code') ?? ''));
  await cambiarEstadoSesion(code, 'finished');

  revalidatePath('/');
  revalidatePath(`/sala/${code}/tv`);
  redirect(`/sala/${code}/tv`);
}

/* ------------------------------------------- acciones sin redirección
 *
 * Estas las llama el reproductor desde el navegador, no un formulario. No pueden
 * redirigir: interrumpirían la reproducción en curso.
 */

/** Marca el turno como sonando. La llama el reproductor al pulsar Cantar. */
export async function empezarTurnoAction(code: string, queueItemId: number) {
  const limpio = normalizarCodigo(code);
  await iniciarTurno(limpio, queueItemId);
  revalidatePath(`/sala/${limpio}`);
  revalidatePath(`/sala/${limpio}/tv`);
}

/** Cierra el turno y calcula la puntuación. La llama el reproductor al terminar. */
export async function terminarTurnoAction(
  code: string,
  queueItemId: number,
  telemetria: {
    pausas?: number;
    saltos?: number;
    posicionFinal?: number;
    duracionObservada?: number;
    terminoNatural?: boolean;
  },
) {
  const limpio = normalizarCodigo(code);
  await cerrarTurnoConPuntuacion(limpio, queueItemId, telemetria);
  revalidatePath(`/sala/${limpio}`);
  revalidatePath(`/sala/${limpio}/tv`);
}

/** Retira de la cola un turno cuya pista no se pudo reproducir, sin puntuar al cantante. */
export async function descartarTurnoRotoAction(code: string, queueItemId: number) {
  const limpio = normalizarCodigo(code);
  await cerrarTurno(limpio, queueItemId, 'skipped');
  revalidatePath(`/sala/${limpio}`);
  revalidatePath(`/sala/${limpio}/tv`);
}
