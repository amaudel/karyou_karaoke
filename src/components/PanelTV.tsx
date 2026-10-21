'use client';

import RankingMesas from './RankingMesas';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  iniciarTurnoAction,
  cerrarTurnoAction,
  moverAction,
  cambiarModoSesionAction,
  terminarSesionAction,
} from '@/app/sala/actions';
import { despertar, silenciar } from '@/lib/sonido.mjs';
import type { FilaVista, FilaRankingVista, FilaMesaVista } from '@/app/sala/tipos';

/**
 * El panel lateral de la pantalla de TV: quién canta, la cola, el ranking y el QR.
 *
 * Es una región HERMANA del reproductor, nunca superpuesta. La revelación del
 * resultado NO vive aquí: ocupa la caja del reproductor (`AnimacionResultado`).
 */
export default function PanelTV({
  code,
  modo = 'casa',
  segundosEnPantalla = 0,
  sonando,
  esperando,
  aplausos,
  oyentes,
  ranking,
  rankingMesas,
  tieneRevancha,
  qr,
  enlace,
  onDescartar,
  onActivarTV,
}: {
  code: string;
  modo?: 'casa' | 'bar';
  segundosEnPantalla?: number;
  sonando: FilaVista | null;
  esperando: FilaVista[];
  aplausos: number;
  oyentes: number;
  ranking: FilaRankingVista[];
  rankingMesas: FilaMesaVista[];
  tieneRevancha: boolean;
  qr: string;
  enlace: string;
  onDescartar?: () => void;
  onActivarTV?: () => void;
}) {
  const [sonido, setSonido] = useState(true);

  useEffect(() => {
    // Los navegadores no dejan sonar nada antes de que el usuario interactúe. Se
    // espera al primer gesto, que en la pantalla es el botón Cantar.
    despertar();

    // La preferencia se lee en un efecto y no durante el render, para que el
    // primer HTML coincida con el del servidor.
    let activo = true;
    try {
      activo = window.localStorage.getItem('karaoke-sonido') !== 'off';
    } catch {
      // Sin almacenamiento disponible: se queda con sonido.
    }
    setSonido(activo);
    silenciar(!activo);
  }, []);

  const alternarSonido = useCallback(() => {
    setSonido((anterior) => {
      const siguiente = !anterior;
      silenciar(!siguiente);
      try {
        window.localStorage.setItem('karaoke-sonido', siguiente ? 'on' : 'off');
      } catch {
        // Da igual: la preferencia no sobrevive a la recarga.
      }
      return siguiente;
    });
  }, []);

  // Lo que está en el reproductor es lo que suena, o la primera de la cola ya
  // preparada. La cola de abajo no repite esa primera.
  const enPantalla = sonando ?? esperando[0] ?? null;
  const enCola = sonando ? esperando : esperando.slice(1);

  return (
    <>
      {/* ------------------------------------------------ quién canta ahora */}
      <div className="rounded-2xl border border-pink-500/35 bg-gradient-to-br from-purple-900/45 via-purple-950/50 to-pink-950/30 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold tracking-widest text-pink-300 uppercase">
            {sonando ? '🎤 Cantando ahora' : enPantalla ? '⏭ Turno preparado' : 'Nadie cantando'}
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase border ${
                modo === 'bar'
                  ? 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                  : 'border-purple-400/30 bg-purple-500/20 text-purple-200'
              }`}
            >
              {modo === 'bar' ? '🍻 Bar' : '🏠 Casa'}
            </span>
            {sonando && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                👏 {aplausos}/{oyentes}
              </span>
            )}
          </div>
        </div>

        {tieneRevancha && enPantalla && (
          <div className="mt-3 rounded-xl border border-amber-300/60 bg-gradient-to-r from-orange-950/80 to-fuchsia-950/70 px-3 py-3 text-center text-white shadow-lg">
            <p className="text-lg font-black tracking-wide text-amber-300">🔥 ¡LA REVANCHA!</p>
            <p className="text-sm font-bold">{enPantalla.nickname} regresa al escenario</p>
            <p className="text-xs text-amber-100/80">La segunda oportunidad no adelanta su turno.</p>
          </div>
        )}
        {enPantalla ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-2xl font-black text-white">{enPantalla.nickname}</p>
              {enPantalla.mesa && (
                <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                  🪑 {enPantalla.mesa}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm font-semibold text-purple-200/85">
              {enPantalla.song_title} · <span className="text-purple-300/70">{enPantalla.artist}</span>
            </p>
            {!sonando && modo === 'bar' && segundosEnPantalla >= 40 && (
              <p className="mt-2 rounded-xl border border-amber-500/40 bg-amber-950/40 px-2.5 py-1.5 text-xs font-bold text-amber-300">
                ⏳ Esperando a {enPantalla.nickname}
                {enPantalla.mesa ? ` (${enPantalla.mesa})` : ''} ({segundosEnPantalla}s). A los 60s se habilita
                pasar turno desde cualquier celular.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-purple-300/70">Nadie ha pedido nada todavía.</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {sonando ? (
            <form action={cerrarTurnoAction}>
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="queueItemId" value={sonando.id} />
              <input type="hidden" name="resultado" value="skipped" />
              <button
                type="submit"
                className="rounded-xl border border-purple-400/35 bg-purple-950/50 px-3.5 py-1.5 text-xs font-bold text-purple-200 transition hover:border-pink-400 hover:bg-pink-500/20 hover:text-white"
              >
                ⏭ Saltar turno
              </button>
            </form>
          ) : (
            esperando[0] && (
              <>
                <form action={iniciarTurnoAction}>
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="queueItemId" value={esperando[0].id} />
                  <button
                    type="submit"
                    className="rounded-xl border border-purple-400/35 bg-purple-950/50 px-3.5 py-1.5 text-xs font-bold text-purple-200 transition hover:border-pink-400 hover:bg-pink-500/20 hover:text-white"
                  >
                    ▶ Poner en pantalla
                  </button>
                </form>
                {onDescartar && (
                  <button
                    type="button"
                    onClick={onDescartar}
                    className="rounded-xl border border-amber-400/35 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-500/20"
                  >
                    ⏭ Pasar ausente
                  </button>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- la cola */}
      <div className="rounded-2xl border border-purple-500/25 bg-purple-950/30 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-extrabold tracking-widest text-purple-300 uppercase">
            La cola
          </h2>
          <span className="rounded-full bg-purple-900/60 px-2.5 py-0.5 text-[11px] font-bold text-purple-200 border border-purple-700/40">
            {enCola.length} esperando
          </span>
        </div>

        {enCola.length === 0 ? (
          <p className="mt-2.5 text-xs text-purple-300/70">No hay más canciones en espera.</p>
        ) : (
          <ol className="mt-2.5 space-y-1.5">
            {enCola.slice(0, 5).map((fila, indice) => (
              <li
                key={fila.id}
                className="flex items-center gap-2 rounded-xl border border-purple-500/15 bg-purple-950/40 px-2.5 py-1.5 text-sm"
              >
                <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-amber-300">
                  {indice + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-white">{fila.song_title}</div>
                  <div className="flex items-center gap-1.5 truncate text-[11px] text-purple-300/75">
                    <span className="truncate">{fila.nickname}</span>
                    {fila.mesa && (
                      <span className="shrink-0 font-medium text-amber-300">· 🪑 {fila.mesa}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {indice > 0 && (
                    <form action={moverAction}>
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="queueItemId" value={fila.id} />
                      <input type="hidden" name="direccion" value="-1" />
                      <button
                        type="submit"
                        aria-label={`Subir ${fila.song_title}`}
                        className="rounded-lg border border-purple-500/30 bg-purple-900/40 px-2 py-0.5 text-xs font-bold text-purple-200 hover:bg-purple-800/60"
                      >
                        ↑
                      </button>
                    </form>
                  )}
                  {indice < enCola.length - 1 && (
                    <form action={moverAction}>
                      <input type="hidden" name="code" value={code} />
                      <input type="hidden" name="queueItemId" value={fila.id} />
                      <input type="hidden" name="direccion" value="1" />
                      <button
                        type="submit"
                        aria-label={`Bajar ${fila.song_title}`}
                        className="rounded-lg border border-purple-500/30 bg-purple-900/40 px-2 py-0.5 text-xs font-bold text-purple-200 hover:bg-purple-800/60"
                      >
                        ↓
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {modo === 'bar' && <RankingMesas mesas={rankingMesas} compacto />}

      {/* ---------------------------------------------------------- ranking */}
      {ranking.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-purple-950/30 p-4 shadow-xl backdrop-blur-md">
          <h2 className="text-xs font-extrabold tracking-widest text-amber-300 uppercase">
            🏆 Ranking de la noche
          </h2>
          <ol className="mt-2.5 space-y-1.5">
            {ranking.slice(0, 5).map((f) => {
              const medalla =
                f.posicion === 1
                  ? '🥇'
                  : f.posicion === 2
                    ? '🥈'
                    : f.posicion === 3
                      ? '🥉'
                      : `${f.posicion}.`;
              return (
                <li key={f.participant_id} className="flex items-center gap-2.5 text-xs">
                  <span className="w-5 shrink-0 text-center font-black tabular-nums text-amber-300">
                    {medalla}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold text-white">{f.nickname}</span>
                  <span className="shrink-0 rounded-full border border-purple-500/30 bg-purple-900/60 px-2 py-0.5 font-black tabular-nums text-amber-300">
                    {f.mejor}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ------------------------------------------------------------ entrar */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-950/35 p-4 text-center shadow-xl backdrop-blur-md">
        <span className="inline-block rounded-full border border-purple-400/30 bg-purple-500/20 px-3 py-0.5 text-[10px] font-extrabold tracking-widest text-purple-300 uppercase mb-1.5">
          ÚNETE CON TU CELULAR
        </span>
        <div className="mt-1 inline-block rounded-2xl border-2 border-purple-300/30 bg-white p-2 shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt={`Código QR para entrar a la sala ${code}`}
            width={136}
            height={136}
            className="rounded-xl"
          />
        </div>
        <p className="mt-1.5 font-mono text-xl font-black tracking-[0.3em] text-amber-300 drop-shadow">
          {code}
        </p>
        <p className="mt-0.5 text-[11px] text-purple-300/60 break-all">{enlace}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href={`/sala/${code}`}
          target="_blank"
          className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-2 font-bold text-purple-200 transition hover:bg-purple-900/40"
        >
          📱 Vista móvil
        </Link>
        <button
          type="button"
          onClick={alternarSonido}
          aria-pressed={sonido}
          className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-2 font-bold text-purple-200 transition hover:bg-purple-900/40"
        >
          {sonido ? '🔊 Sonido' : '🔇 Silencio'}
        </button>
        {onActivarTV && (
          <button
            type="button"
            onClick={onActivarTV}
            className="rounded-xl border border-purple-500/30 bg-purple-950/40 px-3 py-2 font-bold text-purple-200 transition hover:bg-purple-900/40"
          >
            ⛶ Pantalla completa
          </button>
        )}
        <form action={cambiarModoSesionAction}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="modo" value={modo === 'bar' ? 'casa' : 'bar'} />
          <button
            type="submit"
            className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 font-bold text-amber-300 transition hover:bg-amber-900/40"
          >
            {modo === 'bar' ? 'Cambiar a 🏠 Casa' : 'Cambiar a 🍻 Bar'}
          </button>
        </form>
        <form action={terminarSesionAction}>
          <input type="hidden" name="code" value={code} />
          <button
            type="submit"
            className="rounded-xl border border-red-500/30 bg-red-950/25 px-3 py-2 font-bold text-red-300 transition hover:bg-red-900/40"
          >
            Terminar noche
          </button>
        </form>
      </div>
    </>
  );
}
