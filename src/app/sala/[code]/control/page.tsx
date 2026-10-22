import Link from 'next/link';
import { notFound } from 'next/navigation';
import Refresco from '@/components/Refresco';
import AccesosTV from '@/components/AccesosTV';
import { obtenerSesion, estadoSesion, normalizarCodigo } from '@/db/sessions.mjs';
import { rankingDeSesion, rankingMesasDeSesion } from '@/db/puntuaciones.mjs';
import {
  moverAction, iniciarTurnoAction, cerrarTurnoAction,
  cambiarModoSesionAction, cambiarEspectaculoAction, terminarSesionAction,
} from '../../actions';
import type { EstadoVista, FilaRankingVista, FilaMesaVista } from '../../tipos';

export const dynamic = 'force-dynamic';

export default async function ControlSala({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizarCodigo(raw);
  const sesion = await obtenerSesion(code);
  if (!sesion) notFound();
  const estado = (await estadoSesion(code)) as EstadoVista | null;
  if (!estado) notFound();
  const ranking = (await rankingDeSesion(sesion.id)) as FilaRankingVista[];
  const mesas = sesion.modo === 'bar'
    ? (await rankingMesasDeSesion(sesion.id)) as FilaMesaVista[] : [];
  const enPantalla = estado.sonando ?? estado.esperando[0] ?? null;
  const pendientes = estado.sonando ? estado.esperando : estado.esperando.slice(1);

  return (
    <main className="mx-auto max-w-5xl space-y-6 rounded-3xl border border-purple-800/40 bg-gradient-to-b from-[#18092e] to-[#090414] p-4 text-white sm:p-8">
      <Refresco cada={4000} />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-purple-600/25 pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-pink-300">⚙ Administración · Karyou</p>
          <h1 className="mt-2 text-3xl font-black">Panel del anfitrión</h1>
          <p className="mt-1 text-sm text-purple-200/80">{sesion.name} · Código <strong className="text-amber-300">{code}</strong> · {sesion.modo === 'bar' ? 'Modo Bar' : 'Modo Casa'}</p>
          <p className="mt-1 text-xs text-purple-300/70">Controles operativos separados de la pantalla pública. Mantén la TV abierta en otra pestaña o dispositivo.</p>
        </div>
        <Link href={`/sala/${code}/tv`} target="_blank" rel="noopener noreferrer"
          className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-3 text-sm font-black">
          📺 Abrir pantalla pública ↗
        </Link>
      </header>
      <AccesosTV />
      {sesion.modo === 'bar' && (
        <Link href={`/sala/${code}/control/publicidad`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/45 bg-gradient-to-r from-[#3a114d] via-[#381047] to-[#19092a] p-5 shadow-lg shadow-fuchsia-950/40 transition hover:border-amber-300">
          <span><strong className="block text-lg font-black text-amber-200">✦ Karyou Bar Ads</strong>
            <span className="text-sm text-purple-100">Subir promos, programarlas y presentarlas como parte del espectáculo</span></span>
          <span className="shrink-0 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-black text-white">Administrar ↗</span>
        </Link>
      )}
      {sesion.status === 'finished' ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6">
          <h2 className="text-xl font-black">🏆 La noche ha terminado</h2>
          <p className="mt-2 text-purple-200">La ceremonia final se presenta en la TV. Puedes crear otra sala sin afectar los resultados de esta.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="space-y-4 rounded-2xl border border-pink-500/30 bg-purple-950/50 p-5 lg:col-span-2">
            <h2 className="text-lg font-black text-pink-200">🎤 Turno actual</h2>
            {enPantalla ? (
              <>
                <div className="rounded-xl bg-purple-900/40 p-4">
                  <p className="text-2xl font-black">{enPantalla.nickname}</p>
                  <p className="text-sm text-purple-200">{enPantalla.song_title} · {enPantalla.artist}</p>
                  {enPantalla.mesa && <p className="mt-1 text-xs text-amber-300">🪑 {enPantalla.mesa}</p>}
                  <p className="mt-2 text-xs text-purple-300">{estado.sonando ? 'Cantando ahora' : 'En espera de iniciar'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!estado.sonando && (
                    <form action={iniciarTurnoAction}>
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="queueItemId" value={enPantalla.id} />
                      <input type="hidden" name="origen" value="control" />
                      <button type="submit" className="rounded-xl bg-pink-600 px-4 py-3 font-bold hover:bg-pink-500">▶ Iniciar turno</button>
                    </form>
                  )}
                  <form action={cerrarTurnoAction}>
                    <input type="hidden" name="code" value={code} />
                    <input type="hidden" name="queueItemId" value={enPantalla.id} />
                    <input type="hidden" name="origen" value="control" />
                    <button type="submit" className="rounded-xl border border-orange-400/50 px-4 py-3 font-bold text-orange-200 hover:bg-orange-900/50">
                      ⏭ {estado.sonando ? 'Finalizar actuación' : 'Pasar turno'}
                    </button>
                  </form>
                </div>
              </>
            ) : <p className="text-purple-300">No hay canciones en cola. Los invitados pueden pedir canciones desde sus celulares.</p>}
            <h3 className="border-t border-purple-700/30 pt-4 text-sm font-black uppercase tracking-wide text-purple-200">
              Próximos turnos ({pendientes.length})
            </h3>
            <ol className="space-y-2">
              {pendientes.map((fila, i) => (
                <li key={fila.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-purple-500/20 bg-purple-900/25 p-3">
                  <span className="font-black text-amber-300">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{fila.nickname}{fila.mesa ? ` · ${fila.mesa}` : ''}</p>
                    <p className="truncate text-xs text-purple-300">{fila.song_title}</p>
                  </div>
                  <div className="flex gap-1">
                    {[-1, 1].map((direccion) => (
                      <form key={direccion} action={moverAction}>
                        <input type="hidden" name="code" value={code} />
                        <input type="hidden" name="queueItemId" value={fila.id} />
                        <input type="hidden" name="direccion" value={direccion} />
                        <input type="hidden" name="origen" value="control" />
                        <button type="submit" aria-label={direccion === -1 ? 'Subir turno' : 'Bajar turno'}
                          className="rounded-lg border border-purple-400/30 px-3 py-2 hover:bg-purple-700/40">
                          {direccion === -1 ? '↑' : '↓'}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-purple-500/30 bg-purple-950/50 p-5">
              <h2 className="mb-3 text-lg font-black">⚙ Ajustes de sala</h2>
              <div className="mb-5 space-y-3">
                <p className="text-sm font-bold text-purple-100">✨ Intensidad del espectáculo en TV</p>
                <div className="grid gap-2">
                  {([
                    ['discreto', '🌙 Discreto', 'Sin confeti ni luces continuas'],
                    ['fiesta', '🎉 Fiesta', 'Brillos y celebración equilibrados'],
                    ['epico', '🔥 Épico', 'Luces, confeti y gran celebración'],
                  ] as const).map(([valor, titulo, descripcion]) => (
                    <form key={valor} action={cambiarEspectaculoAction}>
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="espectaculo" value={valor} />
                      <button type="submit" aria-pressed={sesion.espectaculo === valor}
                        className={`w-full rounded-xl border p-3 text-left transition ${sesion.espectaculo === valor
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-purple-400/20 bg-purple-900/20 text-purple-200 hover:bg-purple-800/40'}`}>
                        <span className="block text-sm font-black">{titulo} {sesion.espectaculo === valor ? '✓' : ''}</span>
                        <span className="mt-1 block text-xs opacity-75">{descripcion}</span>
                      </button>
                    </form>
                  ))}
                </div>
                <p className="text-xs text-purple-300/70">Se guarda por sala y se refleja en la TV con su actualización automática. No cambia las notas ni el orden.</p>
              </div>
              <form action={cambiarModoSesionAction} className="space-y-2">
                <input type="hidden" name="code" value={code} />
                <input type="hidden" name="origen" value="control" />
                <input type="hidden" name="modo" value={sesion.modo === 'bar' ? 'casa' : 'bar'} />
                <button type="submit" className="w-full rounded-xl border border-amber-400/40 px-3 py-3 text-sm font-bold text-amber-200 hover:bg-amber-900/30">
                  Cambiar a {sesion.modo === 'bar' ? '🏠 Casa' : '🍻 Bar'}
                </button>
              </form>
              <form action={terminarSesionAction} className="mt-4 space-y-2">
                <input type="hidden" name="code" value={code} />
                <button type="submit" className="w-full rounded-xl border border-red-500/40 px-3 py-3 text-sm font-bold text-red-200 hover:bg-red-900/40">
                  🏁 Terminar noche y mostrar podio
                </button>
                <p className="text-xs text-purple-300/70">Esta acción cierra la sesión y presenta los ganadores en la pantalla de TV.</p>
              </form>
            </section>
            <section className="rounded-2xl border border-amber-500/30 bg-purple-950/50 p-5">
              <h2 className="text-lg font-black text-amber-200">🏆 Marcadores</h2>
              <p className="mt-2 text-xs text-purple-200">{ranking.length} cantantes clasificados · {mesas.length} mesas</p>
              {ranking.slice(0, 3).map((fila) => <p key={fila.participant_id} className="mt-2 text-sm">🎤 {fila.nickname} · <strong>{fila.mejor}</strong></p>)}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
