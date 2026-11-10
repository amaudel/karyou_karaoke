'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { intervaloSondeo, debeSondear } from '@/domain/polling.mjs';

/**
 * Sondeo adaptativo sin cambiar la fuente de verdad ni desmontar el reproductor.
 * - Pausa el sondeo de pestañas ocultas y dispositivos sin conexión.
 * - Desfase de hasta 20 % para evitar picos simultáneos entre salas.
 * - Actualiza al regresar a primer plano o recuperar la conexión.
 * - La TV mantiene 2 s; los participantes usan 5 s.
 * No sustituye a un endpoint de estado ligero; es una primera reducción segura.
 */
export default function Refresco({ cada = 5000 }: { cada?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activo = true;
    let ultimaActualizacion = Date.now();
    const permitido = () => debeSondear(document.visibilityState === 'visible', navigator.onLine);

    const programar = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (!activo || !permitido()) return;
      timer = setTimeout(() => {
        if (!activo || !permitido()) return;
        ultimaActualizacion = Date.now();
        router.refresh();
        programar();
      }, intervaloSondeo(cada, Math.random()));
    };

    const reanudar = () => {
      if (!activo) return;
      if (!permitido()) {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        return;
      }
      // Evita doble refresco al recibir visibilitychange, focus y online juntos.
      if (Date.now() - ultimaActualizacion >= Math.max(2000, cada)) {
        ultimaActualizacion = Date.now();
        router.refresh();
      }
      programar();
    };

    document.addEventListener('visibilitychange', reanudar);
    window.addEventListener('focus', reanudar);
    window.addEventListener('online', reanudar);
    window.addEventListener('offline', programar);
    programar();
    return () => {
      activo = false;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener('visibilitychange', reanudar);
      window.removeEventListener('focus', reanudar);
      window.removeEventListener('online', reanudar);
      window.removeEventListener('offline', programar);
    };
  }, [router, cada]);

  return null;
}
