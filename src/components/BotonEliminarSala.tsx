'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { eliminarSesionAction } from '@/app/sala/actions';

/** Dos decisiones independientes: aviso de impacto y escritura del código. */
export default function BotonEliminarSala({
  code,
  nombre,
}: {
  code: string;
  nombre: string;
}) {
  const [paso, setPaso] = useState<0 | 1 | 2>(0);
  const [codigoEscrito, setCodigoEscrito] = useState('');
  const [estado, enviar, pendiente] = useActionState(eliminarSesionAction, { error: '' });
  const campoCodigo = useRef<HTMLInputElement>(null);
  const cerrar = () => {
    if (pendiente) return;
    setPaso(0);
    setCodigoEscrito('');
  };

  useEffect(() => {
    if (paso === 2) campoCodigo.current?.focus();
  }, [paso]);

  useEffect(() => {
    if (paso === 0) return;
    const escucharEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && !pendiente) cerrar();
    };
    document.addEventListener('keydown', escucharEscape);
    return () => document.removeEventListener('keydown', escucharEscape);
  // cerrar reinicia el estado; este efecto solo necesita el paso y la petición.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, pendiente]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPaso(1)}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2.5 text-xs font-bold text-rose-200 transition hover:border-rose-400/60 hover:bg-rose-900/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
        aria-label={`Eliminar sala ${nombre}`}
      >
        <span aria-hidden="true">🗑️</span> Eliminar
      </button>

      {paso !== 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`eliminar-titulo-${code}`}
            aria-describedby={`eliminar-descripcion-${code}`}
            className="w-full max-w-md rounded-2xl border border-rose-500/35 bg-[#1b1030] p-6 text-white shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id={`eliminar-titulo-${code}`} className="text-xl font-extrabold">
                {paso === 1 ? '¿Eliminar esta sala?' : 'Confirmación final'}
              </h2>
              <button
                type="button"
                onClick={cerrar}
                disabled={pendiente}
                aria-label="Cerrar confirmación"
                className="rounded-lg px-2 py-1 text-purple-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-pink-400 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {paso === 1 ? (
              <>
                <p id={`eliminar-descripcion-${code}`} className="text-sm leading-relaxed text-purple-100/85">
                  Vas a eliminar <strong className="text-white">{nombre}</strong> ({code}).
                  Se perderán los participantes, las canciones de la cola, las puntuaciones y
                  el historial de esta sala. No se pueden recuperar desde la aplicación.
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={cerrar}
                    className="rounded-xl border border-purple-400/40 px-4 py-2.5 text-sm font-bold text-purple-100 hover:bg-purple-500/15">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => setPaso(2)}
                    className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-600">
                    Sí, continuar
                  </button>
                </div>
              </>
            ) : (
              <form action={enviar}>
                <p id={`eliminar-descripcion-${code}`} className="text-sm leading-relaxed text-purple-100/85">
                  Para confirmar por segunda vez, escribe el código <strong className="font-mono tracking-widest text-amber-300">{code}</strong>.
                  Esta acción es irreversible.
                </p>
                <input type="hidden" name="code" value={code} />
                <label htmlFor={`confirmacion-${code}`} className="mt-5 block text-xs font-bold uppercase tracking-wide text-purple-200">
                  Código de la sala
                </label>
                <input
                  ref={campoCodigo}
                  id={`confirmacion-${code}`}
                  name="confirmacion"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={6}
                  required
                  value={codigoEscrito}
                  onChange={(evento) => setCodigoEscrito(evento.target.value.toUpperCase())}
                  placeholder="Escribe el código"
                  className="mt-2 w-full rounded-xl border border-purple-400/40 bg-black/25 px-4 py-3 font-mono text-lg tracking-widest text-white placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-purple-300/40 focus:border-rose-400 focus:outline-none"
                />
                {estado.error && (
                  <p role="alert" className="mt-3 text-sm font-semibold text-rose-300">{estado.error}</p>
                )}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={pendiente}
                    className="rounded-xl border border-purple-400/40 px-4 py-2.5 text-sm font-bold text-purple-100 hover:bg-purple-500/15 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={pendiente || codigoEscrito !== code}
                    className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pendiente ? 'Eliminando...' : 'Eliminar definitivamente'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
