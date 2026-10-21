import Link from 'next/link';

/**
 * La TV oculta la navegación global; estos accesos devuelven al anfitrión
 * el control de sus salas. Crear otra sala nunca cierra la actual.
 */
export default function AccesosTV({ compacto = false }: { compacto?: boolean }) {
  return (
    <nav aria-label="Administrar salas de karaoke" className={`flex flex-wrap items-center gap-2 ${compacto ? 'text-xs' : 'text-sm'}`}>
      <Link
        href="/#salas-abiertas"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-purple-400/40 bg-purple-950/60 px-3 py-2 font-bold text-purple-100 transition hover:border-purple-300 hover:bg-purple-800/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
      >
        ← Mis salas
      </Link>
      <Link
        href="/#crear-sala"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-pink-400/60 bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 font-black text-white shadow-lg shadow-pink-500/20 transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
      >
        ＋ Crear nueva sala
      </Link>
    </nav>
  );
}
