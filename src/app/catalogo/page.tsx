import Link from 'next/link';
import { searchPool, getCatalog, listarFavoritos } from '@/db/queries.mjs';
import {
  agregarAlCatalogo,
  toggleFavoritoCatalogoAction,
  importarUrlCatalogoAction,
} from '../actions';
import { BotonFavorito, BotonImportarUrl } from '@/components/BotonesAccion';
import { mensajeDeError } from '../sala/mensajes';

export const dynamic = 'force-dynamic';

/** 245 -> "4:05". Sin duración todavía devuelve "—". */
function duracion(segundos: number | null): string {
  if (!segundos) return '—';
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ETIQUETA_VOCAL: Record<string, { texto: string; color: string }> = {
  pure: { texto: 'sin voz', color: 'text-[var(--color-exito)]' },
  backing: { texto: 'con coros', color: 'text-[var(--color-alerta)]' },
  guide: { texto: 'voz guía', color: 'text-[var(--color-alerta)]' },
  lead: { texto: 'con voz', color: 'text-red-400' },
  unreviewed: { texto: 'sin revisar', color: 'text-[var(--color-tenue)]' },
};

const VOCAL_POR_DEFECTO = { texto: 'sin revisar', color: 'text-[var(--color-tenue)]' };

/** El valor viene de la base, así que se trata como dato, no como unión de tipos. */
function etiquetaVocal(clase: unknown): { texto: string; color: string } {
  return ETIQUETA_VOCAL[String(clase ?? '')] ?? VOCAL_POR_DEFECTO;
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; aviso?: string; importada?: string }>;
}) {
  const { q, aviso: avisoClave, importada } = await searchParams;
  const consulta = (q ?? '').trim();
  const aviso = mensajeDeError(avisoClave);
  const resultados = consulta ? await searchPool(consulta) : [];
  const favoritos = !consulta ? await listarFavoritos(40) : [];
  const catalogo = await getCatalog();

  return (
    <div className="relative min-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-4 sm:p-8 text-white shadow-2xl">
      {/* ------------------------------------------------ Ambient Lights & Glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-purple-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-pink-500/15 blur-3xl" />

      <div className="relative z-10 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wide uppercase bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
            Catálogo y Favoritos
          </h1>
          <p className="mt-1 text-sm text-purple-300/70">
            Busca en el pool local, marca tus favoritas con ★ o agrega canciones nuevas pegando el
            enlace de YouTube (`oEmbed`, sin límite diario).
          </p>
        </div>

        {aviso && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-sm font-semibold text-amber-300">
            {aviso}
          </p>
        )}

        {importada && (
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 text-sm font-semibold text-emerald-300">
            ✓ Pista verificada con YouTube e incorporada al pool y a tu catálogo.
          </p>
        )}

        <form method="get" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={consulta}
            placeholder="Canción o artista…"
            autoComplete="off"
            aria-label="Buscar canción o artista"
            className="min-w-0 flex-1 rounded-xl border border-purple-500/30 bg-purple-950/40 px-3.5 py-3 text-base placeholder:text-purple-300/40 focus:border-purple-400 focus:outline-none shadow-inner text-white"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm sm:px-6 sm:text-base font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95"
          >
            Buscar
          </button>
        </form>

        {/* --------------------------------------- alta por URL de YouTube (oEmbed) */}
        <details
          key={`url-cat-${consulta}-${resultados.length === 0 ? 'vacio' : 'con-resultados'}`}
          open={Boolean(consulta && resultados.length === 0)}
          className="group rounded-2xl border border-purple-500/25 bg-purple-950/25 p-4 text-sm backdrop-blur-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold text-purple-200 hover:text-white">
            <span>🔗 Agregar canción suelta por enlace de YouTube (oEmbed)</span>
            <span className="text-xs text-purple-400 transition group-open:rotate-180">▼</span>
          </summary>
          <form action={importarUrlCatalogoAction} className="mt-3 space-y-2.5">
            <p className="text-xs text-purple-300/75">
              Pega la URL o ID de cualquier video de karaoke de YouTube. Se valida con `oEmbed` que
              permita reproducción embebida y queda guardado en el pool para siempre.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                name="url"
                required
                placeholder="https://www.youtube.com/watch?v=... o https://youtu.be/..."
                className="min-w-0 flex-1 rounded-xl border border-purple-500/35 bg-purple-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-purple-300/40 focus:border-pink-400 focus:outline-none"
              />
              <BotonImportarUrl texto="🔗 Importar al catálogo" />
            </div>
          </form>
        </details>

        {/* ------------------------------------------------ resultados del pool */}
        {consulta && (
          <>
            <p className="text-sm font-bold text-purple-300/80">
              {resultados.length === 0
                ? 'Sin resultados en el pool.'
                : `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'} para «${consulta}»`}
            </p>

            {resultados.length === 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 text-sm backdrop-blur-sm">
                <p className="font-bold text-amber-300">No está en el pool todavía.</p>
                <p className="mt-2 text-amber-200/70">
                  Pega su enlace de YouTube en el recuadro de arriba para verificarla con `oEmbed` e
                  incorporarla al instante, o importa el canal completo con{' '}
                  <code className="text-amber-100 bg-amber-900/50 px-1 rounded">pnpm importar</code>.
                </p>
              </div>
            )}

            {resultados.length > 0 && (
              <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/20 bg-purple-950/20 backdrop-blur-md shadow-xl">
                {resultados.map((r) => {
                  const vocal = etiquetaVocal(r.vocal_class);
                  return (
                    <li key={r.video_id} className="flex items-start sm:items-center gap-3 sm:gap-4 p-3 transition hover:bg-purple-900/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`}
                        alt=""
                        width={120}
                        height={68}
                        loading="lazy"
                        className="h-14 w-20 sm:h-[68px] sm:w-[120px] shrink-0 rounded-lg object-cover shadow-md mt-0.5 sm:mt-0"
                      />

                      <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <div className="line-clamp-2 text-sm sm:text-base font-extrabold leading-snug text-white break-words">
                            {r.song_title || r.video_title}
                          </div>
                          {r.artist && (
                            <div className="mt-0.5 truncate text-xs sm:text-sm text-purple-200/80">
                              {r.artist}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-purple-300/60">
                            <span className="truncate max-w-[140px] sm:max-w-none">{r.channel_name}</span>
                            <span className="tabular-nums font-mono">{duracion(r.duration_seconds)}</span>
                            <span className={`font-bold ${vocal.color}`}>{vocal.texto}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <form action={toggleFavoritoCatalogoAction} className="shrink-0">
                              <input type="hidden" name="videoId" value={r.video_id} />
                              <BotonFavorito activo={Boolean(r.is_favorite)} />
                            </form>
                            {r.in_catalog ? (
                              <Link
                                href={`/cantar/${r.video_id}`}
                                className="shrink-0 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-bold text-white shadow-md transition hover:scale-105 active:scale-95"
                              >
                                Cantar
                              </Link>
                            ) : (
                              <form action={agregarAlCatalogo} className="shrink-0">
                                <input type="hidden" name="videoId" value={r.video_id} />
                                <button
                                  type="submit"
                                  className="rounded-xl border border-pink-500/50 px-3.5 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-bold text-pink-300 transition hover:bg-pink-500/20 hover:text-white"
                                >
                                  Agregar
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* ------------------------------------------------------ favoritas + mi catálogo */}
        {!consulta && (
        <>
          {favoritos.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-amber-500/30 pb-3">
                <h2 className="text-xl font-black tracking-wide text-amber-300 uppercase">
                  ⭐ Favoritas
                </h2>
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-200 border border-amber-400/40">
                  {favoritos.length} {favoritos.length === 1 ? 'favorita' : 'favoritas'}
                </span>
              </div>

              <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-amber-500/25 bg-purple-950/25 backdrop-blur-md shadow-xl">
                {favoritos.map((f) => (
                  <li key={f.video_id} className="flex items-start sm:items-center gap-3 sm:gap-4 p-3 transition hover:bg-purple-900/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${f.video_id}/mqdefault.jpg`}
                      alt=""
                      width={120}
                      height={68}
                      loading="lazy"
                      className="h-14 w-20 sm:h-[68px] sm:w-[120px] shrink-0 rounded-lg object-cover shadow-md mt-0.5 sm:mt-0"
                    />
                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <div className="line-clamp-2 text-sm sm:text-base font-extrabold leading-snug text-white break-words">
                          {f.song_title || f.video_title}
                        </div>
                        {f.artist && (
                          <div className="mt-0.5 truncate text-xs sm:text-sm text-purple-200/80">
                            {f.artist}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-purple-300/60">
                          <span className="truncate max-w-[140px] sm:max-w-none">{f.channel_name}</span>
                          <span className="tabular-nums font-mono">{duracion(f.duration_seconds)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <form action={toggleFavoritoCatalogoAction} className="shrink-0">
                            <input type="hidden" name="videoId" value={f.video_id} />
                            <BotonFavorito activo />
                          </form>
                          <Link
                            href={`/cantar/${f.video_id}`}
                            className="shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-2 text-xs sm:px-5 sm:py-2.5 sm:text-sm font-bold text-white shadow-md transition hover:scale-105 active:scale-95"
                          >
                            Cantar
                          </Link>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {catalogo.length === 0 ? (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5 text-sm text-purple-200/80 backdrop-blur-sm shadow-inner">
              <p className="font-bold text-white text-base">
                Todavía no has agregado canciones al catálogo.
              </p>
              <p className="mt-2 text-purple-300/70">Busca arriba y pulsa Agregar. Prueba con:</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['shakira', 'mana', 'juan gabriel', 'vicente fernandez', 'daddy yankee'].map(
                  (sugerencia) => (
                    <Link
                      key={sugerencia}
                      href={`/catalogo?q=${encodeURIComponent(sugerencia)}`}
                      className="rounded-full border border-purple-500/30 bg-purple-900/30 px-4 py-1.5 font-semibold text-purple-200 transition hover:border-pink-500 hover:bg-pink-500/20 hover:text-white"
                    >
                      {sugerencia}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ) : (
            <section className="space-y-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-purple-800/40 pb-3">
                <h2 className="text-xl font-black tracking-wide text-white uppercase">
                  Mi catálogo
                </h2>
                <span className="rounded-full bg-purple-900/60 px-3 py-1 text-xs font-bold text-purple-300 border border-purple-700/40">
                  {catalogo.length} {catalogo.length === 1 ? 'canción' : 'canciones'}
                </span>
              </div>

              <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/20 bg-purple-950/20 backdrop-blur-md shadow-xl">
                {catalogo.map((s) => (
                  <li key={s.song_id} className="flex items-start sm:items-center gap-3 sm:gap-4 p-3 transition hover:bg-purple-900/30">
                    {s.primary_video_id ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`https://i.ytimg.com/vi/${s.primary_video_id}/mqdefault.jpg`}
                        alt=""
                        width={120}
                        height={68}
                        loading="lazy"
                        className="h-14 w-20 sm:h-[68px] sm:w-[120px] shrink-0 rounded-lg object-cover shadow-md mt-0.5 sm:mt-0"
                      />
                    ) : (
                      <div className="h-14 w-20 sm:h-[68px] sm:w-[120px] shrink-0 rounded-lg bg-purple-950/50 border border-purple-800/30 flex items-center justify-center text-2xl mt-0.5 sm:mt-0">
                        🎵
                      </div>
                    )}

                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <div className="line-clamp-2 text-sm sm:text-base font-extrabold leading-snug text-white break-words">
                          {s.title}
                        </div>
                        {s.artist && (
                          <div className="mt-0.5 truncate text-xs sm:text-sm text-purple-200/80">
                            {s.artist}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-purple-300/60">
                          {s.available_count > 0 && (
                            <span className="tabular-nums font-mono">{duracion(s.duration_seconds)}</span>
                          )}
                          {s.channel_name && (
                            <span className="truncate max-w-[140px] sm:max-w-none">{s.channel_name}</span>
                          )}
                          {s.source_count > 1 && (
                            <span
                              className={
                                s.available_count > 1
                                  ? 'font-bold text-emerald-400'
                                  : 'font-bold text-purple-400'
                              }
                            >
                              {s.available_count} de {s.source_count} versiones
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.primary_video_id && (
                            <form action={toggleFavoritoCatalogoAction} className="shrink-0">
                              <input type="hidden" name="videoId" value={s.primary_video_id} />
                              <BotonFavorito activo={Boolean(s.is_favorite)} />
                            </form>
                          )}
                          {s.primary_video_id ? (
                            <Link
                              href={`/cantar/${s.primary_video_id}`}
                              className="shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-2 text-xs sm:px-5 sm:py-2.5 sm:text-sm font-bold text-white shadow-md transition hover:scale-105 active:scale-95"
                            >
                              Cantar
                            </Link>
                          ) : (
                            <span className="shrink-0 rounded-xl border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-400/50">
                              No disponible
                            </span>
                          )}
                        </div>
                      </div>
                      {s.available_count === 0 && (
                        <p className="text-[11px] font-semibold text-pink-400">
                          Ninguna versión se puede reproducir: YouTube bloqueó la inserción por
                          derechos. Si algún día se desbloquea, volverá a estar disponible sola.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      </div>
    </div>
  );
}
