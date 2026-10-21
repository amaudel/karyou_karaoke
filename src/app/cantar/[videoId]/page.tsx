import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import KaraokeStage from '@/components/KaraokeStage';
import PanelCancion from '@/components/PanelCancion';
import { getPoolItem } from '@/db/queries.mjs';

export const dynamic = 'force-dynamic';

/** Un videoId de YouTube son 11 caracteres de este alfabeto. */
const FORMATO_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

type Props = { params: Promise<{ videoId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { videoId } = await params;
  if (!FORMATO_VIDEO_ID.test(videoId)) return { title: 'Pista no encontrada' };

  const item = await getPoolItem(videoId);
  if (!item) return { title: 'Pista no encontrada' };

  return { title: `${item.song_title || item.video_title} — ${item.artist}` };
}

export default async function CantarPage({ params }: Props) {
  const { videoId } = await params;

  // El videoId viene de la URL: se valida antes de tocar la base.
  if (!FORMATO_VIDEO_ID.test(videoId)) notFound();

  const item = await getPoolItem(videoId);
  if (!item) notFound();

  const cancion = {
    videoId: item.video_id,
    titulo: item.song_title || item.video_title,
    artista: item.artist,
    canal: item.channel_name,
    duracion: item.duration_seconds,
    vocalClass: item.vocal_class,
  };

  return <KaraokeStage cancion={cancion} panel={<PanelCancion cancion={cancion} />} />;
}
