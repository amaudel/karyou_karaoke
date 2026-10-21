import type { FilaMesaVista } from '@/app/sala/tipos';

export default function RankingMesas({ mesas, compacto = false }: {
  mesas: FilaMesaVista[];
  compacto?: boolean;
}) {
  if (!mesas.length) return null;
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-purple-950/50 p-4 text-white">
      <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-amber-300">
        🏆 Batalla de mesas
      </h2>
      <p className="mb-3 text-xs text-purple-200/75">
        Promedio de canciones válidas · mínimo 3 para entrar al podio
      </p>
      <ol className="space-y-2" aria-label="Clasificación de mesas">
        {(compacto ? mesas.slice(0, 4) : mesas).map((fila) => (
          <li key={fila.mesa.toLocaleLowerCase('es')}
            className="flex items-center gap-2 rounded-xl border border-purple-400/20 bg-purple-900/30 p-2 text-xs">
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
