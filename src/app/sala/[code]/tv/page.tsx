import { notFound } from 'next/navigation';
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
