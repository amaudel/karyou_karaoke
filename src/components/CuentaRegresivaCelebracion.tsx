'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Cuenta regresiva basada en el tiempo RESTANTE que confirmó el servidor.
 * Solo informa / refresca: NO inicia automáticamente la canción.
 */
export default function CuentaRegresivaCelebracion({
  restanteMs, grande = false,
}: { restanteMs: number; grande?: boolean }) {
  const router = useRouter();
  const [faltante, setFaltante] = useState(Math.max(0, restanteMs));
  const hasta = useRef(Date.now() + Math.max(0, restanteMs));
  const refrescado = useRef(false);

  useEffect(() => {
    hasta.current = Date.now() + Math.max(0, restanteMs);
    refrescado.current = false;
    setFaltante(Math.max(0, restanteMs));
  }, [restanteMs]);

  useEffect(() => {
    if (restanteMs <= 0) return;
    const actualizar = () => {
      const ms = Math.max(0, hasta.current - Date.now());
      setFaltante(ms);
      if (ms === 0 && !refrescado.current) {
        refrescado.current = true;
        router.refresh();
      }
    };
    actualizar();
    const id = window.setInterval(actualizar, 100);
    return () => window.clearInterval(id);
  }, [restanteMs, router]);

  const segundos = Math.ceil(faltante / 1000);
  return (
    <div aria-live="polite"
      className={grande
        ? 'flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#200a35] via-[#10061b] to-[#341044] p-6 text-center text-white'
        : 'rounded-2xl border border-amber-400/45 bg-gradient-to-r from-purple-950/90 to-fuchsia-950/70 p-4 text-center text-white shadow-lg'}>
      <p className="text-xs font-black uppercase tracking-[.18em] text-amber-300">✦ Karyou Karaoke Party</p>
      <p className={grande ? 'text-xl font-black sm:text-3xl' : 'text-lg font-black'}>
        🏆 ¡Estamos celebrando!
      </p>
      <p className="text-sm text-purple-100/90">La próxima canción estará disponible en</p>
      <p className={grande ? 'font-mono text-5xl font-black tabular-nums text-amber-300 sm:text-6xl' : 'font-mono text-3xl font-black tabular-nums text-amber-300'}>
        00:{String(segundos).padStart(2, '0')}
      </p>
      <p className="text-xs font-bold text-purple-200">
        {faltante > 0 ? '🔒 Play se habilitará al finalizar' : '🎤 Preparando el siguiente turno…'}
      </p>
    </div>
  );
}
