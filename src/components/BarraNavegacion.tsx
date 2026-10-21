'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra superior adaptativa:
 * - Si el usuario está dentro de una sala (`/sala/...`), oculta los enlaces de
 *   administración (`Inicio`, `Catálogo`, `Historial`) y desactiva el enlace del
 *   logo hacia `/` para que ningún invitado con el celular salga por accidente de
 *   la sala ni llegue al botón de Pantalla TV.
 */
export default function BarraNavegacion() {
  const pathname = usePathname() ?? '';
  const enSala = pathname.startsWith('/sala/');
  const enTV = pathname.endsWith('/tv');

  // En la vista de TV la propia pantalla ya tiene su cabecera y controles.
  if (enTV) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-purple-900/40 bg-[#080414]/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {enSala ? (
          <div className="flex items-center gap-2.5 select-none">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-base shadow-md shadow-purple-500/20">
              🎤
            </span>
            <span className="text-lg font-black tracking-wider uppercase bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
              KARYOU
            </span>
          </div>
        ) : (
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-base shadow-md shadow-purple-500/20 transition group-hover:scale-105">
              🎤
            </span>
            <span className="text-lg font-black tracking-wider uppercase bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
              KARYOU
            </span>
          </Link>
        )}

        {!enSala && (
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-purple-200/80 transition hover:bg-purple-900/40 hover:text-white"
            >
              Inicio
            </Link>
            <Link
              href="/catalogo"
              className="hidden md:inline-block rounded-lg px-3 py-1.5 text-sm font-semibold text-purple-200/80 transition hover:bg-purple-900/40 hover:text-white"
            >
              Catálogo
            </Link>
            <Link
              href="/historial"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-purple-200/80 transition hover:bg-purple-900/40 hover:text-white"
            >
              Historial
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
