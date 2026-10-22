import { LIMITE_PENDIENTES } from '@/db/sessions.mjs';

/**
 * Mensajes en español para los errores de la cola.
 *
 * Viven aquí y no en `actions.ts` porque un archivo con `'use server'` solo puede
 * exportar funciones asíncronas.
 */
export const MENSAJES: Record<string, string> = {
  SESION_NO_EXISTE: 'Esa sala no existe. Revisa el código.',
  SESION_CERRADA: 'Esa sala ya se cerró.',
  SESION_NO_ACTIVA: 'La sala está en pausa.',
  APODO_VACIO: 'Escribe un apodo.',
  APODO_OCUPADO: 'Ese apodo ya está en uso en esta sala. Prueba con otro.',
  MESA_REQUERIDA: 'En Modo Bar debes ingresar el nombre o número de tu mesa para poder gestionar los turnos.',
  NO_IDENTIFICADO: 'Vuelve a entrar: se perdió tu identificación.',
  PISTA_INVALIDA: 'Esa pista no es válida.',
  PISTA_NO_DISPONIBLE: 'Esa pista no se puede reproducir. Prueba otra.',
  LIMITE_ALCANZADO: `Ya tienes ${LIMITE_PENDIENTES} canciones pedidas. Espera a cantar alguna.`,
  YA_PEDIDA: 'Ya la tienes pedida.',
  NO_ES_TUYA_O_YA_EMPEZO: 'Solo puedes cancelar tus propias canciones y antes de empezar.',
  TURNO_NO_EXISTE: 'Ese turno ya no existe.',
  YA_ESTA_EN_EL_EXTREMO: 'Ya está en el extremo.',
  NO_HAY_TURNO: 'Ahora mismo no está cantando nadie.',
  NO_TE_APLAUDAS: 'No puedes aplaudirte a ti mismo.',
  YA_APLAUDISTE: 'Ya aplaudiste esta canción.',
  TURNO_RESERVADO_BAR:
    'En Modo Bar el turno está reservado para el cantante durante 60 segundos antes de poder saltarlo.',
  YA_ESTA_CANTANDO: 'La canción ya está sonando en la TV.',
  CELEBRACION_EN_CURSO: 'Estamos celebrando el resultado anterior. Play estará disponible cuando termine la cuenta regresiva.',
  URL_INVALIDA: 'Pega un enlace válido de YouTube (ej. https://youtu.be/... o youtube.com/watch?v=...).',
  NO_EMBEBIBLE:
    'Ese canal de YouTube bloquea la reproducción en sitios externos. Prueba con otra versión de karaoke.',
  VIDEO_NO_EXISTE: 'No se encontró ese video en YouTube o es privado.',
  CANAL_EXCLUIDO:
    'Ese canal (ej. Sing King) desactiva la reproducción externa. Busca otra versión de la canción.',
  ERROR_OEMBED: 'No se pudo verificar el enlace con YouTube. Inténtalo de nuevo.',
};

/** @param {string | undefined} clave */
export function mensajeDeError(clave: string | undefined): string | null {
  if (!clave) return null;
  return MENSAJES[clave] ?? 'No se pudo completar la acción.';
}
