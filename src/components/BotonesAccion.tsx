'use client';

import { useFormStatus } from 'react-dom';

/**
 * Botón interactivo "Pedir" con feedback instantáneo y spinner animado al enviar.
 */
export function BotonPedir({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-extrabold text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Añadiendo…</span>
        </>
      ) : (
        <>
          <span>🎤 Pedir</span>
        </>
      )}
    </button>
  );
}

/**
 * Botón interactivo "Entrar a cantar" con estado de carga al iniciar sesión.
 */
export function BotonEntrar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-5 py-4 text-lg font-bold text-white shadow-xl transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
    >
      {pending ? (
        <>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Entrando a la sala…</span>
        </>
      ) : (
        <>
          <span>🎤 Entrar a cantar</span>
        </>
      )}
    </button>
  );
}

/**
 * Botón interactivo "Aplaudir" con animación al enviar.
 */
export function BotonAplaudir({ aplausos }: { aplausos: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-pink-600 px-5 py-4 text-lg font-extrabold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? (
        <>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Enviando ovación…</span>
        </>
      ) : (
        <>
          <span>👏 Aplaudir{aplausos > 0 && ` · ${aplausos}`}</span>
        </>
      )}
    </button>
  );
}

/**
 * Botón "Cancelar" para peticiones en cola.
 */
export function BotonCancelar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-300 transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
    >
      {pending ? 'Cancela…' : 'Cancelar'}
    </button>
  );
}

/**
 * Botón interactivo "Buscar" con feedback visual instantáneo y spinner animado.
 */
export function BotonBuscar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 font-bold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 min-w-[110px]"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Buscando…</span>
        </>
      ) : (
        <>
          <span>🔍 Buscar</span>
        </>
      )}
    </button>
  );
}

/**
 * Botón para que el cantante ponga Play en la TV desde su celular.
 */
export function BotonDarPlayTV({ texto = '▶ Poner Play en la TV' }: { texto?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-5 py-3.5 text-base font-black text-white shadow-xl shadow-emerald-950/40 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Iniciando en la TV…</span>
        </>
      ) : (
        <>
          <span>{texto}</span>
        </>
      )}
    </button>
  );
}

/**
 * Botón para que el cantante termine su turno desde su celular.
 */
export function BotonTerminarTurnoMovil() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-900/40 disabled:opacity-50"
    >
      {pending ? 'Terminando…' : '⏹ Terminar turno'}
    </button>
  );
}

/**
 * Botón para pasar un turno cuando el cantante en espera no aparece tras el tiempo de gracia.
 */
export function BotonSaltarInactivo({ texto = '⏭ Pasar al siguiente turno' }: { texto?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-500/20 px-4 py-2.5 text-xs font-extrabold text-amber-200 shadow-md transition hover:bg-amber-500/30 active:scale-95 disabled:opacity-50"
    >
      {pending ? 'Pasando turno…' : texto}
    </button>
  );
}

/**
 * Botón de estrella (★ / ☆) para guardar o quitar una canción de Favoritos.
 */
export function BotonFavorito({ activo }: { activo?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={activo ? 'Quitar de favoritas' : 'Guardar en favoritas'}
      title={activo ? 'Quitar de favoritas' : 'Guardar en favoritas'}
      className={`inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border text-base transition active:scale-90 disabled:opacity-50 ${
        activo
          ? 'border-amber-400/60 bg-amber-500/20 text-amber-300 shadow-sm shadow-amber-500/20 hover:bg-amber-500/30'
          : 'border-purple-500/30 bg-purple-950/40 text-purple-300/60 hover:border-amber-400/50 hover:text-amber-300'
      }`}
    >
      {pending ? '…' : activo ? '★' : '☆'}
    </button>
  );
}

/**
 * Botón para importar una canción suelta por URL de YouTube (oEmbed).
 */
export function BotonImportarUrl({
  texto = '🎤 Importar y Pedir',
  disabled,
}: {
  texto?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-pink-600 to-purple-600 px-4 py-3 text-xs sm:px-5 sm:text-sm font-extrabold text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Verificando…</span>
        </>
      ) : (
        <span>{texto}</span>
      )}
    </button>
  );
}
