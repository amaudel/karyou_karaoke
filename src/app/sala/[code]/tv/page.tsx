import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { esPropietarioSala, cookiePropietarioSala } from '@/db/session-owners.mjs';
import { verifyTvToken, tvCookieName } from '@/db/tv-access.mjs';
import QRCode from 'qrcode';
import EscenarioTV from '@/components/EscenarioTV';
import PantallaEspera from '@/components/PantallaEspera';
import Refresco from '@/components/Refresco';
import PodioFinal from '@/components/PodioFinal';
import { promocionesDeSala } from '@/db/bar-ads.mjs';
import type {PromocionBar} from '@/components/AnuncioBar';
import { obtenerSesion, estadoSesion, normalizarCodigo } from '@/db/sessions.mjs';
import { ultimoResultado, rankingDeSesion, rankingMesasDeSesion, contarAplausos, revanchaPendiente, notaAnteriorRevancha } from '@/db/puntuaciones.mjs';
import { urlSala } from '@/lib/red.mjs';
import {
  empezarTurnoAction,
  terminarTurnoAction,
  confirmarInicioCelebracionAction,
  descartarTurnoRotoAction,
} from '../../actions';
import type { EstadoVista, ResultadoVista, FilaRankingVista, FilaMesaVista } from '../../tipos';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ceremonia?:string}> };

/** Cuánto tiempo se considera «recién salido» un resultado. Gobierna la animación. */
const SEGUNDOS_RECIENTE = 45;

export default async function PantallaPage({ params, searchParams }: Props) {
  const { code: codeSucio } = await params;
  const query = await searchParams;
  // La nueva ceremonia es la predeterminada. El modo clásico sigue disponible
  // para comparar o volver temporalmente sin cambiar código ni despliegues.
  const usarCeremoniaPremium = query?.ceremonia !== 'clasica';
  const code = normalizarCodigo(codeSucio);

  const sesion = await obtenerSesion(code);
  if (!sesion) notFound();

  // Bloquear la pantalla ANTES de montar YouTube: una sala antigua puede
  // conservar la cola pero carecer de la cookie de TV introducida por seguridad.
  // El propietario del mismo dispositivo sigue autorizado sin emparejar de nuevo.
  const jar = await cookies();
  const autorizado = await esPropietarioSala(
    sesion.id,
    jar.get(cookiePropietarioSala(code))?.value,
    jar.get('karyou_bar_owner')?.value,
  ) || await verifyTvToken(sesion.id, jar.get(tvCookieName(code))?.value);
  if (!autorizado) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section role="alert" className="w-full max-w-xl rounded-2xl border border-amber-400/50 bg-slate-900 p-8 text-center space-y-5">
          <h1 className="text-2xl font-extrabold text-amber-300">TV pendiente de emparejar</h1>
          <p>Esta sala sigue activa. Por seguridad, esta pantalla debe vincularse nuevamente antes de reproducir canciones y guardar calificaciones.</p>
          <p className="text-slate-300">Desde el dispositivo del anfitrión, abre el panel de control de esta sala, genera un enlace de TV y ábrelo aquí. No elimines la sala ni sus canciones.</p>
          <p className="font-mono text-sm text-slate-400">Sala: {code}</p>
        </section>
      </main>
    );
  }

  const estado = (await estadoSesion(code)) as EstadoVista | null;
  if (!estado) notFound();

  const crudo = (await ultimoResultado(sesion.id)) as (ResultadoVista & { segundos: number }) | null;
  // Solo se revela un resultado recién salido. Si no, cada recarga de la tele
  // repetiría la animación de una nota de hace media hora.
  const resultadoReciente = Boolean(crudo && crudo.segundos < SEGUNDOS_RECIENTE);
  const detalle = (() => { try { return JSON.parse(crudo?.detail || '{}'); } catch { return {}; } })();
  const resultado: ResultadoVista | null = resultadoReciente && crudo ? {
    ...crudo,
    revanchaAnterior: detalle.perfil === 'revancha'
      ? await notaAnteriorRevancha(sesion.id, crudo.participant_id, crudo.id) : null,
  } : null;
  const ranking = (await rankingDeSesion(sesion.id)) as FilaRankingVista[];
  const rankingMesas = estado.modo === 'bar' ? (await rankingMesasDeSesion(sesion.id)) as FilaMesaVista[] : [];
  const aplausos = estado.sonando ? await contarAplausos(estado.sonando.id) : 0;
  const oyentes = estado.participantes?.length ?? 0;
  const promociones = estado.modo === 'bar' ? await promocionesDeSala(sesion.id) as PromocionBar[] : [];

  const enlace = urlSala(code);
  // PNG en datos, no SVG embebido: evita inyectar HTML generado.
  const qr = await QRCode.toDataURL(enlace, { margin: 1, width: 260 });

  // Lo que se carga en el reproductor: lo que está sonando o, si nadie canta, la
  // primera de la cola, ya preparada.
  const enTurno = estado.sonando ?? estado.esperando[0] ?? null;
  const tieneRevancha = Boolean(enTurno && sesion.status !== 'finished' &&
    await revanchaPendiente(sesion.id, enTurno.participant_id));

  if (sesion.status === 'finished') {
    return <div data-espectaculo={sesion.espectaculo} className="karyou-tv-fx"><PodioFinal code={code} modo={estado.modo} ranking={ranking} rankingMesas={rankingMesas} /></div>;
  }

  /* ------------------------------------ nada en cola: pantalla de espera */
  if (!enTurno) {
    return (
      <>
        <Refresco cada={2000} />
        <div data-espectaculo={sesion.espectaculo} className="karyou-tv-fx"><PantallaEspera
          code={code}
          modo={estado.modo}
          enlace={enlace}
          qr={qr}
          ranking={ranking}
          rankingMesas={rankingMesas}
          promociones={promociones}
          resultado={resultado}
          resultadoReciente={resultadoReciente}
          usarCeremoniaPremium={usarCeremoniaPremium}
          onInicioCelebracion={confirmarInicioCelebracionAction.bind(null, code)}
        /></div>
      </>
    );
  }

  /* ------------------------------------------------------- con cola activa */
  const cancion = {
    videoId: enTurno.video_id,
    titulo: enTurno.song_title || enTurno.video_title,
    artista: enTurno.artist,
    canal: enTurno.channel_name ?? '',
    duracion: enTurno.duration_seconds,
    vocalClass: 'unreviewed',
  };

  return (
    <>
      <Refresco cada={2000} />
      <div data-espectaculo={sesion.espectaculo} className="karyou-tv-fx"><EscenarioTV
        code={code}
        cancion={cancion}
        estado={estado}
        resultado={resultado}
        resultadoReciente={resultadoReciente}
        ranking={ranking}
        rankingMesas={rankingMesas}
        tieneRevancha={tieneRevancha}
        promociones={promociones}
        aplausos={aplausos}
        oyentes={oyentes}
        qr={qr}
        enlace={enlace}
        onCantar={empezarTurnoAction.bind(null, code, enTurno.id)}
        onTerminar={terminarTurnoAction.bind(null, code, enTurno.id)}
        onInicioCelebracion={confirmarInicioCelebracionAction.bind(null, code)}
        usarCeremoniaPremium={usarCeremoniaPremium}
        onDescartar={descartarTurnoRotoAction.bind(null, code, enTurno.id)}
      /></div>
    </>
  );
}
