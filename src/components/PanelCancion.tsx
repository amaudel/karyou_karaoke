import type { CancionEnEscenario } from './KaraokeStage';

function mmss(segundos: number | null | undefined): string {
  if (!segundos || segundos <= 0 || !Number.isFinite(segundos)) return '—';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Panel lateral por defecto: qué se está cantando.
 *
 * Se pasa como `panel` a KaraokeStage. Existe como componente aparte para que la
 * pantalla de TV pueda sustituirlo por uno con la cola, sin duplicar el
 * reproductor ni arriesgarse a que algo se dibuje encima de él.
 */
export default function PanelCancion({ cancion }: { cancion: CancionEnEscenario }) {
  return (
    <>
      <div className="rounded-2xl border border-pink-500/35 bg-gradient-to-br from-purple-900/45 via-purple-950/50 to-pink-950/30 p-5 shadow-xl backdrop-blur-md">
        <p className="text-xs font-extrabold tracking-widest text-pink-300 uppercase">
          🎤 Cantando ahora
        </p>
        <h2 className="mt-2 text-2xl leading-tight font-black text-white">{cancion.titulo}</h2>
        <p className="mt-1 text-base font-semibold text-purple-200/85">{cancion.artista}</p>

        <dl className="mt-5 space-y-2 border-t border-purple-800/40 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-purple-300/70">Duración</dt>
            <dd className="font-mono font-bold tabular-nums text-white">{mmss(cancion.duracion)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-purple-300/70">Fuente</dt>
            <dd className="text-right font-semibold text-purple-100">{cancion.canal}</dd>
          </div>
        </dl>
      </div>

      {cancion.vocalClass !== 'pure' && (
        <div className="rounded-2xl border border-purple-500/25 bg-purple-950/30 p-4 text-sm text-purple-200/80 shadow-lg backdrop-blur-md">
          {cancion.vocalClass === 'unreviewed' &&
            'Esta pista no se ha escuchado, así que no se sabe si trae coros o voz guía.'}
          {cancion.vocalClass === 'backing' && 'Esta pista trae coros de acompañamiento.'}
          {cancion.vocalClass === 'guide' && 'Esta pista trae voz guía.'}
          {cancion.vocalClass === 'lead' && 'Esta pista parece traer la voz principal.'}
        </div>
      )}

      <div className="rounded-2xl border border-purple-500/20 bg-purple-950/20 p-4 text-xs text-purple-300/65">
        La pista se reproduce con el reproductor oficial de YouTube. La aplicación no descarga ni
        extrae el audio, y no bloquea la publicidad.
      </div>
    </>
  );
}
