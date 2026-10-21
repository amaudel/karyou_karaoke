import Link from 'next/link';
import { getStats } from '@/db/queries.mjs';
import { listarSesiones } from '@/db/sessions.mjs';
import { crearSesionAction } from './sala/actions';

import FormularioCrearNoche from '@/components/FormularioCrearNoche';

// La base de datos es local y cambia sin pasar por el build: nada de render estático.
export const dynamic = 'force-dynamic';

function Dato({
  valor,
  etiqueta,
  tono = 'normal',
}: {
  valor: number | string;
  etiqueta: string;
  tono?: 'normal' | 'tenue' | 'alerta';
}) {
  const color =
    tono === 'tenue'
      ? 'text-purple-300/70'
      : tono === 'alerta'
        ? 'text-pink-400'
        : 'text-white';

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-5 backdrop-blur-md shadow-xl transition hover:bg-purple-900/30">
      <div className={`text-3xl font-black tabular-nums ${color}`}>{valor}</div>
      <div className="mt-1 text-xs font-bold text-purple-300/60 uppercase tracking-wider">{etiqueta}</div>
    </div>
  );
}

export default async function Home() {
  const stats = await getStats();
  const sesiones = await listarSesiones();

  return (
    <div className="relative min-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-6 sm:p-10 text-white shadow-2xl">
      {/* Ambient Lights & Glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-purple-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-pink-500/15 blur-3xl" />

      <div className="relative z-10 space-y-12">
        <section className="space-y-3">
          <h1 className="text-4xl font-black tracking-wide uppercase bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
            Karaoke en Casa o en Bar
          </h1>
          <p className="max-w-2xl text-lg text-purple-300/80">
            Elige el modo de tu sala, pon la pantalla en la TV y que cada persona pida y controle su turno desde su celular.
          </p>
        </section>

        {/* ---------------------------------------------------- noches abiertas */}
        {sesiones.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-black text-white uppercase tracking-wide border-b border-purple-800/40 pb-3">
              Noches abiertas
            </h2>
            <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-3xl border border-purple-500/20 bg-purple-950/20 backdrop-blur-md shadow-xl">
              {sesiones.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 p-5 transition hover:bg-purple-900/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-extrabold text-white">{s.name}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border ${
                          s.modo === 'bar'
                            ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                            : 'border-purple-400/40 bg-purple-500/20 text-purple-200'
                        }`}
                      >
                        {s.modo === 'bar' ? '🍻 Modo Bar' : '🏠 Modo Casa'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-purple-300/70 uppercase tracking-wider">
                      <span className="font-mono text-amber-300 tracking-[0.2em]">{s.code}</span>
                      <span>{s.participantes} participantes</span>
                      <span>{s.en_cola} en cola</span>
                      {s.status === 'paused' && (
                        <span className="text-pink-400">en pausa</span>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full sm:w-auto shrink-0 gap-3">
                    {/* En celular solo se muestra el acceso de cantante; el botón de Pantalla TV
                        solo aparece en pantallas grandes (md+) para no interrumpir el flujo móvil. */}
                    <Link
                      href={`/sala/${s.code}`}
                      className="flex-1 sm:flex-initial rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:scale-105 active:scale-95 text-center flex items-center justify-center gap-1.5"
                    >
                      🎤 Entrar a cantar
                    </Link>
                    <Link
                      href={`/sala/${s.code}/tv`}
                      className="hidden md:inline-flex rounded-xl border border-purple-500/40 bg-purple-900/30 px-5 py-2.5 text-sm font-bold text-purple-200 transition hover:bg-purple-500/20 text-center items-center justify-center gap-1.5"
                    >
                      📺 Pantalla TV
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------------------- nueva noche (solo PC / TV cuando ya hay salas abiertas) */}
        <section
          className={`${
            sesiones.length > 0 ? 'hidden md:block' : 'block'
          } rounded-3xl border border-pink-500/30 bg-gradient-to-br from-purple-900/40 to-pink-900/20 p-6 sm:p-8 backdrop-blur-md shadow-2xl`}
        >
          <h2 className="text-2xl font-black text-white uppercase tracking-wider">Empezar una noche</h2>
          <p className="mt-2 text-sm text-pink-200/70">
            Configura la sala según dónde uses el karaoke: en casa con amigos o en un bar con varias mesas.
          </p>
          <FormularioCrearNoche action={crearSesionAction} />
        </section>

        {/* ------------------------------------------------------- catálogo (solo PC / TV) */}
        <section className="hidden md:block space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-800/40 pb-3">
            <h2 className="text-xl font-black text-white uppercase tracking-wide">El catálogo</h2>
            <Link
              href="/catalogo"
              className="rounded-full border border-pink-500/50 bg-pink-950/30 px-5 py-2 text-sm font-bold text-pink-300 transition hover:bg-pink-500/20 hover:text-white"
            >
              Buscar y agregar
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Dato valor={stats.poolTotal.toLocaleString('es-EC')} etiqueta="Pistas usables" />
            <Dato valor={stats.poolWithDuration.toLocaleString('es-EC')} etiqueta="Con duración" />
            <Dato valor={stats.poolChannels} etiqueta="Canales" />
            <Dato valor={stats.sources} etiqueta="En catálogo" />
          </div>

          <details className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-5 text-sm backdrop-blur-md shadow-inner group">
            <summary className="cursor-pointer font-bold text-purple-300/80 uppercase tracking-wider group-hover:text-pink-300 transition">
              Qué se descartó al importar
            </summary>
            <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] font-bold text-purple-300/50 uppercase tracking-widest">No embebibles</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-pink-500">
                  {stats.poolNotEmbeddable.toLocaleString('es-EC')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-purple-300/50 uppercase tracking-widest">Bloqueadas (D.A.)</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-pink-500">
                  {stats.poolBlocked.toLocaleString('es-EC')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-purple-300/50 uppercase tracking-widest">Descartadas (Título)</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-pink-500">
                  {stats.poolDiscarded.toLocaleString('es-EC')}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-purple-300/50 uppercase tracking-widest">Usables</dt>
                <dd className="mt-1 text-2xl font-black tabular-nums text-emerald-400">
                  {stats.poolTotal.toLocaleString('es-EC')}
                </dd>
              </div>
            </dl>
            <p className="mt-5 border-t border-purple-800/30 pt-4 text-xs font-semibold text-purple-300/60 leading-relaxed">
              Las bloqueadas por derechos se detectan al intentar reproducirlas: la API de YouTube
              las da por buenas, así que no se pueden anticipar. Cuando fallan, el sistema las retira automáticamente.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
