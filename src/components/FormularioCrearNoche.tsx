'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

function BotonSubmit({ modo }: { modo: 'casa' | 'bar' }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3.5 font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <svg
            className="h-5 w-5 animate-spin text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Creando...
        </>
      ) : modo === 'bar' ? (
        '🍻 Crear Sala Modo Bar y abrir TV'
      ) : (
        '🏠 Crear Sala Modo Casa y abrir TV'
      )}
    </button>
  );
}

export default function FormularioCrearNoche({ action }: { action: (formData: FormData) => void }) {
  const [modo, setModo] = useState<'casa' | 'bar'>('casa');

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="modo" value={modo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setModo('casa')}
          aria-pressed={modo === 'casa'}
          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            modo === 'casa'
              ? 'border-pink-400 bg-gradient-to-br from-purple-800/60 to-pink-900/40 shadow-lg shadow-pink-500/15 ring-2 ring-pink-400/50'
              : 'border-purple-500/25 bg-purple-950/35 opacity-75 hover:opacity-100 hover:border-purple-400/50'
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-base font-black text-white">🏠 Modo Casa / Fiesta</span>
            {modo === 'casa' && (
              <span className="rounded-full bg-pink-500/30 border border-pink-400/40 px-2.5 py-0.5 text-[10px] font-extrabold text-pink-200 uppercase">
                Activo
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-purple-200/80">
            Cualquier invitado puede darle Play desde su celular · Hasta 3 canciones en espera por
            persona · Orden por llegada.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setModo('bar')}
          aria-pressed={modo === 'bar'}
          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            modo === 'bar'
              ? 'border-amber-400 bg-gradient-to-br from-amber-900/40 via-purple-900/60 to-pink-900/40 shadow-lg shadow-amber-500/15 ring-2 ring-amber-400/50'
              : 'border-purple-500/25 bg-purple-950/35 opacity-75 hover:opacity-100 hover:border-purple-400/50'
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-base font-black text-white">🍻 Modo Bar / Local</span>
            {modo === 'bar' && (
              <span className="rounded-full bg-amber-500/30 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-200 uppercase">
                Activo
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-purple-200/80">
            Solo el dueño del turno da Play · Si no aparece en 60s se habilita pasar turno · Cola
            justa intercalada por mesas (máx. 2).
          </p>
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          name="nombre"
          maxLength={80}
          placeholder={
            modo === 'bar'
              ? 'Ej: Viernes de Karaoke - Bar Central'
              : 'Ej: Karaoke en casa de Andrés'
          }
          aria-label="Nombre de la noche"
          className="min-w-0 flex-1 rounded-xl border border-purple-500/30 bg-purple-950/40 px-5 py-3.5 text-base text-white placeholder:text-purple-300/40 focus:border-pink-500 focus:outline-none shadow-inner transition"
        />
        <BotonSubmit modo={modo} />
      </div>
    </form>
  );
}
