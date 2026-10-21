import Link from 'next/link';
import { historialDeNoches, resultadosDeSesion } from '@/db/puntuaciones.mjs';
import { obtenerSesion } from '@/db/sessions.mjs';

export const dynamic = 'force-dynamic';

type FilaNoche = {
  id: number;
  code: string;
  name: string;
  status: string;
  created_at: string;
  ended_at: string | null;
  cantantes: number;
  canciones: number;
  mejor: number | null;
};

type FilaResultado = {
  id: number;
  total: number;
  tier: string;
  created_at: string;
  nickname: string;
  song_title: string;
  artist: string;
};

const COLOR_TIER: Record<string, string> = {
  under: 'text-purple-300/70',
  normal: 'text-cyan-300',
  good: 'text-emerald-400',
  excellent: 'text-pink-400',
  exceptional: 'text-amber-300',
};

/** 2026-09-15 23:41:07 -> 15/09/2026 */
function fecha(iso: string): string {
  const soloFecha = String(iso).slice(0, 10);
  const [a, m, d] = soloFecha.split('-');
  return a && m && d ? `${d}/${m}/${a}` : soloFecha;
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ sala?: string }>;
}) {
  const { sala } = await searchParams;
  const noches = (await historialDeNoches()) as FilaNoche[];

  const elegida = sala ? await obtenerSesion(sala) : null;
  const resultados = elegida
    ? ((await resultadosDeSesion(elegida.id)) as FilaResultado[])
    : [];

  return (
    <div className="relative min-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-3xl border border-purple-900/40 bg-gradient-to-b from-[#0c071e] via-[#110a28] to-[#070312] p-4 sm:p-8 text-white shadow-2xl">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-purple-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-pink-500/15 blur-3xl" />

      <div className="relative z-10 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wide uppercase bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
            Historial de noches
          </h1>
          <p className="mt-1 text-sm text-purple-300/75">
            {noches.length === 0
              ? 'Todavía no hay ninguna noche con canciones cantadas.'
              : `${noches.length} ${noches.length === 1 ? 'noche' : 'noches'} con resultados registrados.`}
          </p>
        </div>

        {noches.length > 0 && (
          <ul className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-950/25 backdrop-blur-md shadow-xl">
            {noches.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/historial?sala=${n.code}`}
                  className={`flex flex-wrap items-center gap-4 p-4 sm:p-5 transition hover:bg-purple-900/30 ${
                    elegida?.code === n.code ? 'bg-purple-900/40' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 leading-snug text-base sm:text-lg font-extrabold text-white break-words">{n.name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-purple-300/75 uppercase tracking-wider">
                      <span className="font-mono text-amber-300 tracking-[0.2em]">{n.code}</span>
                      <span>{fecha(n.created_at)}</span>
                      <span>{n.cantantes} cantantes</span>
                      <span>{n.canciones} canciones</span>
                      {n.status !== 'finished' && (
                        <span className="text-pink-400">en curso</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-black tabular-nums text-amber-300">
                      {n.mejor ?? '—'}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300/60">
                      mejor nota
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {elegida && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-800/40 pb-3">
              <h2 className="text-xl font-black tracking-wide text-white uppercase">
                🎤 Canciones de «{elegida.name}»
              </h2>
              <Link
                href={`/sala/${elegida.code}/tv`}
                className="hidden md:inline-flex rounded-xl border border-pink-500/40 bg-pink-950/30 px-4 py-2 text-xs font-bold text-pink-200 transition hover:bg-pink-500/20 hover:text-white"
              >
                📺 Abrir la pantalla
              </Link>
            </div>

            {resultados.length === 0 ? (
              <p className="rounded-2xl border border-purple-500/25 bg-purple-950/25 p-5 text-sm text-purple-300/75">
                Esa noche no tiene resultados guardados.
              </p>
            ) : (
              <ol className="divide-y divide-purple-800/30 overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-950/25 backdrop-blur-md shadow-xl">
                {resultados.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 transition hover:bg-purple-900/25">
                    <span
                      className={`w-12 sm:w-14 shrink-0 text-right text-xl sm:text-2xl font-black tabular-nums ${
                        COLOR_TIER[r.tier] ?? 'text-white'
                      }`}
                    >
                      {r.total}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm sm:text-base font-extrabold leading-snug text-white break-words">{r.song_title}</div>
                      <div className="mt-0.5 truncate text-xs text-purple-200/75">
                        {r.artist} · <strong className="text-pink-300">{r.nickname}</strong>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
