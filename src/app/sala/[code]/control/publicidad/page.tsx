import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { obtenerSesion, normalizarCodigo } from '@/db/sessions.mjs';
import { propietarioDeSala, listarCampanias } from '@/db/bar-ads.mjs';
import PublicidadEditor from '@/components/PublicidadEditor';
import { blobConfigurado } from '@/lib/blob-config.mjs';

export const dynamic='force-dynamic';
type Props={params:Promise<{code:string}>,searchParams:Promise<{error?:string,ok?:string}>};

const MENSAJES:Record<string,string>={
  imagen:'Adjunta una imagen real de hasta 3 MB.',
  storage:'Conecta un almacén Vercel Blob antes de subir imágenes.',
  formato:'El archivo debe ser JPG, PNG o WebP válido.',
  titulo:'Escribe un título válido de máximo 90 caracteres.',
  subida:'No se pudo subir la imagen. Revisa la conexión Blob y vuelve a intentar.',
  registro:'La imagen se subió pero no se pudo registrar la campaña. Revisa la configuración.',
};
export default async function PublicidadBar({params,searchParams}:Props){
  const {code:raw}=await params; const code=normalizarCodigo(raw);
  const sesion=await obtenerSesion(code);
  if(!sesion) notFound();
  if(sesion.modo!=='bar') notFound();
  const token=(await cookies()).get('karyou_bar_owner')?.value;
  const bar=await propietarioDeSala(sesion.id,token);
  const {error,ok}=await searchParams;
  return (
    <main className="mx-auto max-w-6xl space-y-6 rounded-3xl border border-fuchsia-400/20 bg-[#0f061b] p-4 text-white sm:p-7">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-400/20 pb-5">
        <div>
          <p className="text-xs font-black tracking-[.2em] text-amber-300">KARYOU KARAOKE · MODO BAR</p>
          <h1 className="mt-2 text-3xl font-black">Publicidad del bar</h1>
          <p className="mt-2 text-sm text-purple-200">Tu creatividad ya terminada, presentada como parte del espectáculo.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/sala/${code}/control`} className="rounded-xl border border-purple-400/35 px-4 py-3 text-sm font-bold text-purple-100">← Anfitrión</Link>
          <Link href={`/sala/${code}/tv`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-fuchsia-700 px-4 py-3 text-sm font-bold text-white">📺 Ver TV ↗</Link>
        </div>
      </header>
      {!bar ? (
        <section className="rounded-2xl border border-orange-400/40 bg-orange-950/30 p-7">
          <h2 className="text-xl font-black text-amber-200">Acceso reservado al dueño del bar</h2>
          <p className="mt-2 text-purple-100">Esta sala no tiene una credencial de propietario reconocida en este navegador. Por seguridad, no se puede reclamar una sala antigua únicamente con su código.</p>
          <p className="mt-3 text-sm text-purple-200">Crea una nueva noche en Modo Bar desde el navegador del administrador. Las noches posteriores creadas desde el mismo navegador compartirán sus promociones.</p>
          <Link href="/#crear-sala" className="mt-4 inline-block rounded-xl bg-fuchsia-700 px-5 py-3 font-bold">Crear una nueva sala Bar</Link>
        </section>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-950/30 p-4 text-red-100">{MENSAJES[error] || 'Revisa la configuración e inténtalo nuevamente.'}</p>}
          {ok==='logo'&&<p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-emerald-200">Logo actualizado para las promociones del bar.</p>}
          {ok==='creada'&& <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-emerald-200">Imagen guardada como borrador. Actívala cuando esté lista para la TV.</p>}
          <PublicidadEditor code={code} barNombre={bar.name} logoUrl={bar.logo_url}
            campanias={await listarCampanias(bar.id)}
            storageOk={blobConfigurado()}/>
          <p className="rounded-xl border border-purple-500/20 p-4 text-xs text-purple-300">
            Privacidad: la administración se vincula a una cookie segura de este navegador. No compartas acceso de administrador; si pierdes la cookie, necesitarás recuperar el establecimiento mediante soporte.
          </p>
        </>
      )}
    </main>
  );
}
