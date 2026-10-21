import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { searchPool, contarPool, listarFavoritos } from '@/db/queries.mjs';
import {
  obtenerSesion,
  identificar,
  estadoSesion,
  normalizarCodigo,
  LIMITE_PENDIENTES,
  SEGUNDOS_DESBLOQUEO_BAR,
} from '@/db/sessions.mjs';
import Refresco from '@/components/Refresco';
import {
  BotonPedir,
  BotonEntrar,
  BotonAplaudir,
  BotonCancelar,
  BotonDarPlayTV,
  BotonTerminarTurnoMovil,
  BotonSaltarInactivo,
  BotonFavorito,
  BotonImportarUrl,
} from '@/components/BotonesAccion';
import FormularioBuscar from '@/components/FormularioBuscar';
import { contarAplausos, yaAplaudio, rankingDeSesion } from '@/db/puntuaciones.mjs';
import { mensajeDeError } from '../mensajes';
import {
  unirseAction,
  pedirAction,
  pedirPorUrlAction,
  toggleFavoritoSalaAction,
  cancelarAction,
  aplaudirAction,
  iniciarTurnoMovilAction,
  saltarTurnoInactivoMovilAction,
  terminarTurnoMovilAction,
} from '../actions';
import type { EstadoVista, FilaRankingVista } from '../tipos';

export const dynamic = 'force-dynamic';

function mmss(segundos: number | null | undefined): string {
  if (!segundos || segundos <= 0) return '—';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ q?: string; error?: string; pagina?: string }>;
};

export default async function SalaPage({ params, searchParams }: Props) {
  const { code: codeSucio } = await params;
  const code = normalizarCodigo(codeSucio);

  const sesion = await obtenerSesion(code);
  if (!sesion) notFound();

  const { q, error, pagina: paginaParam } = await searchParams;
  const consulta = (q ?? '').trim();
  const aviso = mensajeDeError(error);

  /**
   * Cuántas pistas se listan por página en el móvil.
   *
   * Hay 12.000 en el pool, así que una búsqueda amplia como «vallenato» devuelve
   * 1.265: mostrarlas todas de golpe no cabe en un móvil y hace la página lentísima.
   * Por eso se pagina, y por eso se muestra el total — para que no parezca que solo
   * existen las 20 de la primera página.
   */
  const POR_PAGINA = 20;
  const pagina = Math.max(1, Math.floor(Number(paginaParam)) || 1);

  const jar = await cookies();
  const token = jar.get(`p_${code}`)?.value;
  const quien = await identificar(code, token);

  /* ------------------------------------------------ todavía no ha entrado */
  if (!quien) {
    return (
      <div className="relative mx-auto max-w-md overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-6 sm:p-8 text-white shadow-2xl space-y-6">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="relative z-10 space-y-6">
          <div>
            <span className="inline-block rounded-full border border-purple-400/30 bg-purple-500/20 px-3 py-1 text-[11px] font-bold tracking-widest text-purple-300 uppercase">
              {sesion.modo === 'bar' ? '🍻 SALA DE KARAOKE · MODO BAR' : '🏠 SALA DE KARAOKE · MODO CASA'}
            </span>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{sesion.name}</h1>
            <p className="mt-1 font-mono text-xl font-black tracking-[0.3em] text-amber-300">
              {code}
            </p>
          </div>

          {sesion.status === 'finished' ? (
            <p className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-4 text-sm text-purple-200/80">
              Esta sala ya se cerró.
            </p>
          ) : (
            <form action={unirseAction} className="space-y-4">
              <input type="hidden" name="code" value={code} />
              <div>
                <label
                  htmlFor="apodo"
                  className="block text-xs font-bold tracking-wider text-purple-300 uppercase mb-2"
                >
                  ¿Cómo te llamas?
                </label>
                <input
                  id="apodo"
                  name="apodo"
                  required
                  maxLength={24}
                  autoComplete="nickname"
                  placeholder="Tu apodo en el escenario"
                  className="w-full rounded-xl border border-purple-500/35 bg-purple-950/50 px-4 py-3.5 text-base text-white placeholder:text-purple-300/40 shadow-inner focus:border-pink-400 focus:outline-none"
                />
              </div>

              {sesion.modo === 'bar' && (
                <div>
                  <label
                    htmlFor="mesa"
                    className="block text-xs font-bold tracking-wider text-amber-300 uppercase mb-2"
                  >
                    🍻 ¿En qué mesa estás?
                  </label>
                  <input
                    id="mesa"
                    name="mesa"
                    required
                    maxLength={30}
                    placeholder="Ej: Mesa 4, Barra, Terraza 2"
                    className="w-full rounded-xl border border-amber-500/40 bg-purple-950/50 px-4 py-3.5 text-base text-white placeholder:text-purple-300/40 shadow-inner focus:border-amber-400 focus:outline-none"
                  />
                  <p className="mt-1.5 text-xs text-amber-200/70">
                    Obligatorio en Modo Bar para identificar tu turno y avisarte cuando cantes.
                  </p>
                </div>
              )}

              <BotonEntrar />
            </form>
          )}

          {aviso && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-sm font-semibold text-amber-300">
              {aviso}
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ ya dentro */
  const estado = (await estadoSesion(code)) as EstadoVista | null;
  if (!estado) notFound();

  const limiteSala = estado.limitePendientes ?? LIMITE_PENDIENTES;
  const esModoBar = estado.modo === 'bar';

  const viendoFavoritos = consulta.toLowerCase() === 'favoritos';
  const pareceUrlYoutube = /(?:https?:\/\/|youtu\.be\/|youtube\.com\/)/i.test(consulta);

  const resultados = viendoFavoritos
    ? await listarFavoritos(60)
    : consulta
      ? await searchPool(consulta, POR_PAGINA, (pagina - 1) * POR_PAGINA)
      : [];
  const total = viendoFavoritos
    ? resultados.length
    : consulta
      ? await contarPool(consulta)
      : 0;
  const desde = viendoFavoritos ? 1 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = viendoFavoritos
    ? resultados.length
    : (pagina - 1) * POR_PAGINA + resultados.length;

  const misPendientes = estado.esperando.filter(
    (f) => f.participant_id === quien.participante.id,
  ).length;

  const aplausos = estado.sonando ? await contarAplausos(estado.sonando.id) : 0;
  const yaAplaudi =
    estado.sonando && (await yaAplaudio(estado.sonando.id, quien.participante.id));
  const esMia = estado.sonando?.participant_id === quien.participante.id;
  const enTurnoTV = estado.sonando ?? estado.esperando[0] ?? null;
  const esMiTurnoEnTV = Boolean(enTurnoTV && enTurnoTV.participant_id === quien.participante.id);
  const puedoDarPlay = Boolean(
    !estado.sonando && estado.esperando[0] && (estado.modo === 'casa' || esMiTurnoEnTV),
  );
  const turnoInactivoDesbloqueado =
    !esModoBar || estado.segundosEnPantalla >= SEGUNDOS_DESBLOQUEO_BAR;
  const segundosParaDesbloqueo = Math.max(
    1,
    SEGUNDOS_DESBLOQUEO_BAR - (estado.segundosEnPantalla ?? 0),
  );
  const ranking = (await rankingDeSesion(sesion.id)) as FilaRankingVista[];
  const miPuesto = ranking.find((r) => r.participant_id === quien.participante.id);

  return (
    <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-3.5 sm:p-8 pb-12 text-white shadow-2xl">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-pink-500/15 blur-3xl" />

      <Refresco cada={2000} />

      <div className="relative z-10 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-800/40 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black tracking-wide uppercase text-white">{sesion.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase border ${
                  esModoBar
                    ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                    : 'border-purple-400/35 bg-purple-500/20 text-purple-200'
                }`}
              >
                {esModoBar ? '🍻 Modo Bar' : '🏠 Modo Casa'}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-purple-300/80">
              <span>Cantante:</span>
              <strong className="font-extrabold text-pink-300">{quien.participante.nickname}</strong>
              {quien.participante.mesa && (
                <span className="rounded-md border border-amber-500/40 bg-amber-950/50 px-2 py-0.5 text-xs font-bold text-amber-300">
                  🪑 {quien.participante.mesa}
                </span>
              )}
            </div>
          </div>
          <span className="rounded-xl border border-purple-500/30 bg-purple-950/60 px-3 py-1.5 font-mono text-sm font-black tracking-[0.25em] text-amber-300">
            {code}
          </span>
        </header>

        {aviso && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 text-sm font-semibold text-amber-300">
            {aviso}
          </p>
        )}

        {/* ---------------------------------------------------- sonando ahora */}
        {estado.sonando ? (
          <div className="rounded-2xl border border-pink-500/40 bg-gradient-to-br from-purple-900/50 via-purple-950/60 to-pink-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pink-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pink-500" />
              </span>
              <p className="text-xs font-extrabold tracking-widest text-pink-300 uppercase">
                Cantando ahora
              </p>
            </div>
            <p className="mt-1.5 text-lg font-black text-white">{estado.sonando.song_title}</p>
            <p className="text-sm text-purple-200/80">
              {estado.sonando.artist} ·{' '}
              <strong className="text-amber-300">{estado.sonando.nickname}</strong>
              {estado.sonando.mesa && (
                <span className="ml-1.5 inline-block text-xs font-semibold text-amber-300/90">
                  (🪑 {estado.sonando.mesa})
                </span>
              )}
            </p>

            {/* El aplauso es la única señal de la nota que viene de personas de
                verdad. Y es la única forma barata de tenerla: la audiencia ya está
                aquí, con el móvil en la mano. */}
            {esMia ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-500/30 bg-purple-950/50 p-3">
                <span className="text-sm font-semibold text-purple-200">
                  {aplausos > 0
                    ? `👏 Llevas ${aplausos} ${aplausos === 1 ? 'aplauso' : 'aplausos'} de la sala`
                    : '🎤 ¡Estás cantando en vivo!'}
                </span>
                <form action={terminarTurnoMovilAction} className="shrink-0">
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="queueItemId" value={estado.sonando.id} />
                  <BotonTerminarTurnoMovil />
                </form>
              </div>
            ) : yaAplaudi ? (
              <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3.5 py-2 text-sm font-bold text-emerald-300">
                👏 Ya aplaudiste
                {aplausos > 1 && ` · ${aplausos} en total`}
              </p>
            ) : (
              <form action={aplaudirAction} className="mt-3">
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="queueItemId" value={estado.sonando.id} />
                <BotonAplaudir aplausos={aplausos} />
              </form>
            )}
          </div>
        ) : puedoDarPlay && estado.esperando[0] ? (
          <div className="rounded-2xl border-2 border-emerald-500/80 bg-gradient-to-br from-emerald-950/60 via-purple-950/80 to-purple-900/60 p-5 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <p className="text-xs font-black tracking-widest text-emerald-300 uppercase">
                📺 ¡Tu canción está lista en la TV!
              </p>
            </div>
            <p className="mt-2 text-xl font-black text-white">{estado.esperando[0].song_title}</p>
            <p className="text-sm font-semibold text-purple-200/80">
              {estado.esperando[0].artist} · <span className="text-emerald-300 font-bold">Te toca cantar</span>
            </p>

            <form action={iniciarTurnoMovilAction} className="mt-4">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="queueItemId" value={estado.esperando[0].id} />
              <BotonDarPlayTV texto="▶ Poner Play en la TV" />
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-purple-500/25 bg-purple-950/30 p-4 text-sm text-purple-200/80 backdrop-blur-sm">
            {estado.esperando[0] ? (
              esModoBar && !turnoInactivoDesbloqueado ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-white">
                      Preparada en la TV: {estado.esperando[0].song_title}
                    </p>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                      🍻 Turno de {estado.esperando[0].nickname}
                      {estado.esperando[0].mesa ? ` · 🪑 ${estado.esperando[0].mesa}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-purple-300/75">
                    Esperando a que <strong className="text-amber-300">{estado.esperando[0].nickname}</strong>{' '}
                    {estado.esperando[0].mesa && (
                      <span className="text-amber-300/90 font-medium">({estado.esperando[0].mesa}) </span>
                    )}
                    le dé Play desde su celular. Si no aparece en{' '}
                    <span className="font-mono font-bold text-amber-300">{segundosParaDesbloqueo}s</span>,
                    podrás pasar al siguiente turno.
                  </p>
                </div>
              ) : esModoBar && turnoInactivoDesbloqueado ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-bold text-amber-300">
                      ⏳ {estado.esperando[0].nickname}
                      {estado.esperando[0].mesa ? ` (${estado.esperando[0].mesa})` : ''} lleva más de 1 min sin iniciar su turno
                    </p>
                    <p className="mt-0.5 text-xs text-purple-200/80">
                      {estado.esperando[0].song_title} · Puedes pasar al siguiente cantante o iniciar la pista.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <form action={saltarTurnoInactivoMovilAction} className="shrink-0">
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="queueItemId" value={estado.esperando[0].id} />
                      <BotonSaltarInactivo texto="⏭ Pasar al siguiente turno" />
                    </form>
                    <form action={iniciarTurnoMovilAction} className="shrink-0">
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="queueItemId" value={estado.esperando[0].id} />
                      <BotonDarPlayTV texto="▶ Iniciar en TV" />
                    </form>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-white">
                      Preparada en la TV: {estado.esperando[0].song_title}
                    </p>
                    <p className="text-xs text-purple-300/70">
                      Turno de <strong className="text-amber-300">{estado.esperando[0].nickname}</strong>
                      {estado.esperando[0].mesa ? ` (${estado.esperando[0].mesa})` : ''}
                    </p>
                  </div>
                  <form action={iniciarTurnoMovilAction} className="shrink-0">
                    <input type="hidden" name="code" value={code} />
                    <input type="hidden" name="queueItemId" value={estado.esperando[0].id} />
                    <BotonDarPlayTV texto="▶ Iniciar en TV" />
                  </form>
                </div>
              )
            ) : (
              '🎤 Nadie está cantando ahora mismo. ¡Pide una canción abajo!'
            )}
          </div>
        )}

        {/* -------------------------------------------------------- buscar */}
        <FormularioBuscar consultaInicial={consulta} />

        {consulta ? (
          <section className="space-y-3">
            <p className="text-xs font-bold tracking-wider text-purple-300/80 uppercase">
              {viendoFavoritos
                ? total === 0
                  ? '⭐ Aún no hay canciones favoritas. Toca la estrella ☆ en cualquier canción para guardarla aquí.'
                  : `⭐ ${total} ${total === 1 ? 'canción favorita' : 'canciones favoritas'} listas para pedir`
                : total === 0
                  ? 'Sin resultados en el pool. Pega el link de YouTube abajo para importarla.'
                  : `${total} ${total === 1 ? 'resultado' : 'resultados'} · mostrando ${desde}–${hasta}`}
            </p>

            {resultados.length > 0 && (
              <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-950/30 backdrop-blur-md shadow-xl">
                {resultados.map((r) => {
                  const volverQuery = `?q=${encodeURIComponent(consulta)}&pagina=${pagina}`;
                  return (
                    <li
                      key={r.video_id}
                      className="flex items-start gap-3 p-3 sm:items-center sm:p-3.5 transition hover:bg-purple-900/30"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`}
                        alt=""
                        width={96}
                        height={54}
                        loading="lazy"
                        className="h-14 w-20 sm:h-16 sm:w-28 shrink-0 rounded-lg object-cover shadow"
                      />
                      <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                        <div>
                          <div className="line-clamp-2 text-sm sm:text-base font-extrabold leading-snug text-white break-words">
                            {r.song_title || r.video_title}
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs font-medium text-purple-200/80">
                            {r.artist}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-purple-300/70 tabular-nums">
                            ⏱ {mmss(r.duration_seconds)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <form action={toggleFavoritoSalaAction} className="shrink-0">
                              <input type="hidden" name="code" value={code} />
                              <input type="hidden" name="videoId" value={r.video_id} />
                              <input type="hidden" name="volver" value={volverQuery} />
                              <BotonFavorito activo={Boolean(r.is_favorite)} />
                            </form>
                            <form action={pedirAction} className="shrink-0">
                              <input type="hidden" name="code" value={code} />
                              <input type="hidden" name="videoId" value={r.video_id} />
                              <input type="hidden" name="volver" value={volverQuery} />
                              <BotonPedir disabled={misPendientes >= limiteSala} />
                            </form>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Paginación. El total va arriba, así que aquí solo hace falta poder
                avanzar — y volver, si te has pasado. */}
            {!viendoFavoritos && (hasta < total || pagina > 1) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {pagina > 1 ? (
                  <Link
                    href={`/sala/${code}?q=${encodeURIComponent(consulta)}&pagina=${pagina - 1}`}
                    className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-3.5 py-2.5 text-xs sm:px-4 sm:py-3 sm:text-sm font-bold text-purple-200 transition hover:border-purple-400 hover:bg-purple-900/40"
                  >
                    ← Anterior
                  </Link>
                ) : (
                  <span />
                )}

                {hasta < total && (
                  <Link
                    href={`/sala/${code}?q=${encodeURIComponent(consulta)}&pagina=${pagina + 1}`}
                    className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-xs sm:px-5 sm:py-3 sm:text-sm font-bold text-white shadow-md transition hover:scale-105"
                  >
                    Ver más ({total - hasta} restantes) →
                  </Link>
                )}
              </div>
            )}

            {/* Alta por URL (oEmbed): solo abierta automáticamente cuando hay 0 resultados */}
            {!viendoFavoritos && (
              <details
                key={`url-${consulta}-${total === 0 ? 'vacio' : 'con-resultados'}`}
                open={total === 0}
                className="group rounded-2xl border border-purple-500/25 bg-purple-950/30 p-3.5 text-sm backdrop-blur-sm transition"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold text-purple-200 hover:text-white">
                  <span>🔗 ¿No está tu canción? Pega un link de YouTube</span>
                  <span className="text-xs text-purple-400 transition group-open:rotate-180">▼</span>
                </summary>
                <form action={pedirPorUrlAction} className="mt-3 space-y-2.5">
                  <input type="hidden" name="code" value={code} />
                  <input
                    type="hidden"
                    name="volver"
                    value={consulta ? `?q=${encodeURIComponent(consulta)}` : ''}
                  />
                  <p className="text-xs text-purple-300/75">
                    Pega el enlace de cualquier karaoke de YouTube (`youtu.be/...` o `youtube.com/watch?v=...`). Se verifica al instante sin gastar cuota y entra directo a tu turno.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      name="url"
                      required
                      defaultValue={pareceUrlYoutube ? consulta : ''}
                      placeholder="https://youtu.be/... o link de YouTube"
                      className="min-w-0 flex-1 rounded-xl border border-purple-500/35 bg-purple-950/60 px-3.5 py-2.5 text-sm text-white placeholder:text-purple-300/40 focus:border-pink-400 focus:outline-none"
                    />
                    <BotonImportarUrl
                      texto="🎤 Importar y Pedir"
                      disabled={misPendientes >= limiteSala}
                    />
                  </div>
                </form>
              </details>
            )}
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-black tracking-wider text-white uppercase">
                La cola de turnos {esModoBar && <span className="text-xs font-semibold text-amber-300/80 normal-case">· Intercalada por mesas</span>}
              </h2>
              <span className="rounded-full border border-purple-500/30 bg-purple-950/50 px-3 py-0.5 text-xs font-bold text-purple-300">
                {misPendientes} de {limiteSala} tuyas
              </span>
            </div>

            {estado.cola.length === 0 ? (
              <p className="rounded-2xl border border-purple-500/20 bg-purple-950/25 p-4 text-sm text-purple-300/75">
                La cola está vacía. Busca arriba o elige un género y pide la primera.
              </p>
            ) : (
              <ol className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-950/30 backdrop-blur-md shadow-xl">
                {estado.cola.map((fila, indice) => {
                  const mia = fila.participant_id === quien.participante.id;
                  const mostrarPlayEnFila =
                    !estado.sonando && indice === 0 && (mia || turnoInactivoDesbloqueado);
                  return (
                    <li
                      key={fila.id}
                      className={`flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 ${
                        mia ? 'bg-purple-900/35' : ''
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black tabular-nums ${
                          fila.status === 'singing'
                            ? 'bg-pink-500 text-white shadow-sm shadow-pink-500/40'
                            : mia
                              ? 'bg-purple-600/50 text-purple-100'
                              : 'bg-purple-950/70 text-purple-300/70'
                        }`}
                      >
                        {fila.status === 'singing' ? '♪' : indice + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-extrabold leading-snug text-white break-words">
                          {fila.song_title || fila.video_title}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-purple-200/75">
                          <strong className={mia ? 'text-pink-300' : 'text-purple-200'}>
                            {mia ? 'Tú' : fila.nickname}
                          </strong>
                          {fila.mesa && (
                            <span className="ml-1 text-[11px] font-semibold text-amber-300">
                              (🪑 {fila.mesa})
                            </span>
                          )}{' '}
                          · {fila.artist}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {mostrarPlayEnFila && (
                          <form action={iniciarTurnoMovilAction} className="shrink-0">
                            <input type="hidden" name="code" value={code} />
                            <input type="hidden" name="queueItemId" value={fila.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition active:scale-95"
                            >
                              ▶ Play
                            </button>
                          </form>
                        )}
                        {mia && fila.status === 'waiting' && (
                          <form action={cancelarAction} className="shrink-0">
                            <input type="hidden" name="code" value={code} />
                            <input type="hidden" name="queueItemId" value={fila.id} />
                            <BotonCancelar />
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {/* -------------------------------------------------------- ranking */}
        {ranking.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-black tracking-wider text-white uppercase">
                🏆 Ranking de la noche
              </h2>
              {miPuesto && (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-300">
                  Vas #{miPuesto.posicion} con {miPuesto.mejor} pts
                </span>
              )}
            </div>

            <ol className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-amber-500/25 bg-purple-950/30 backdrop-blur-md shadow-xl">
              {ranking.map((f) => {
                const soyYo = f.participant_id === quien.participante.id;
                const medalla =
                  f.posicion === 1
                    ? '🥇'
                    : f.posicion === 2
                      ? '🥈'
                      : f.posicion === 3
                        ? '🥉'
                        : `#${f.posicion}`;
                return (
                  <li
                    key={f.participant_id}
                    className={`flex items-center gap-3 p-3.5 text-sm ${
                      soyYo ? 'bg-purple-900/40' : ''
                    }`}
                  >
                    <span className="w-7 shrink-0 text-center font-black tabular-nums text-amber-300">
                      {medalla}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-bold text-white">
                      {f.nickname}
                      {soyYo && <span className="text-pink-300"> (tú)</span>}
                    </span>
                    <span className="shrink-0 text-xs text-purple-300/70">
                      {f.canciones} {f.canciones === 1 ? 'canción' : 'canciones'}
                    </span>
                    <span className="shrink-0 rounded-full border border-purple-500/30 bg-purple-900/60 px-2.5 py-0.5 font-black tabular-nums text-amber-300">
                      {f.mejor}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
