import type { FilaMesaVista } from '@/app/sala/tipos';

export default function RankingMesas({ mesas, compacto = false }: {
  mesas: FilaMesaVista[];
  compacto?: boolean;
}) {
  if (!mesas.length) return null;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-purple-950/50 p-4 text-white">
      <div aria-hidden="true" className="karyou-show-spotlight pointer-events-none absolute -top-24 left-1/4 h-40 w-1/2 rounded-full bg-amber-400/10 blur-3xl" />
      <h2 className="relative mb-2 text-sm font-black uppercase tracking-wider text-amber-300">
        🏆 Batalla de mesas
      </h2>
      <p className="mb-3 text-xs text-purple-200/75">
        Promedio de canciones válidas · mínimo 3 para entrar al podio
      </p>
      <ol className="space-y-2" aria-label="Clasificación de mesas">
        {(compacto ? mesas.slice(0, 4) : mesas).map((fila) => (
          <li key={fila.mesa.toLocaleLowerCase('es')}
            className={`karyou-rank-enter flex items-center gap-2 rounded-xl border p-2 text-xs ${fila.posicion === 1 && fila.elegible ? "border-amber-400/60 bg-amber-500/15 shadow-sm shadow-amber-500/15" : "border-purple-400/20 bg-purple-900/30"}`}
            style={{ animationDelay: `${Math.min(fila.posicion - 1, 5) * 90}ms` }}>
            <span className="w-7 text-center font-black text-amber-300">
              {fila.elegible && fila.posicion <= 3
                ? ['🥇', '🥈', '🥉'][fila.posicion - 1]
                : fila.elegible ? `#${fila.posicion}` : '⏳'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{fila.mesa}</span>
              <span className="text-purple-200/70">
                {fila.canciones} {fila.canciones === 1 ? 'actuación' : 'actuaciones'}
                {!fila.elegible && ' · Provisional'}
              </span>
            </span>
            <span className="font-black tabular-nums text-amber-300">{fila.media} pts</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
