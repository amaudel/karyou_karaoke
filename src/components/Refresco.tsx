'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Vuelve a pedir los datos del servidor cada pocos segundos.
 *
 * Se eligió sondeo en lugar de un canal en tiempo real a propósito. Para una fiesta
 * con cinco móviles son unas pocas peticiones por segundo: nada. A cambio no hay
 * canales, ni suscripciones, ni lógica de reconexión, y el servidor sigue siendo la
 * única fuente de verdad. Si algún día se nota lento, se cambia solo esta pieza: ni
 * la base ni las consultas se tocan.
 *
 * `router.refresh()` vuelve a renderizar los componentes de servidor SIN desmontar
 * los de cliente, así que el reproductor de YouTube no se reinicia en cada vuelta.
 */
export default function Refresco({ cada = 2500 }: { cada?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), cada);
    return () => window.clearInterval(id);
  }, [router, cada]);

  return null;
}
