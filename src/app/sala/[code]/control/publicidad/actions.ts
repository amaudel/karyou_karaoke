'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import { obtenerSesion, normalizarCodigo } from '@/db/sessions.mjs';
import {
  propietarioDeSala, crearCampania, cambiarEstadoCampania,
  actualizarMarcaBar, actualizarLogoBar,
  editarCampania, campaniaDelBar, eliminarCampania
} from '@/db/bar-ads.mjs';

function ruta(code: string) { return `/sala/${code}/control/publicidad`; }

async function autorizacion(code: string) {
  const sesion = await obtenerSesion(code);
  if (!sesion || sesion.modo !== 'bar') throw new Error('La publicidad solo está disponible en Modo Bar.');
  const token = (await cookies()).get('karyou_bar_owner')?.value;
  const bar = await propietarioDeSala(sesion.id,token);
  if (!bar) throw new Error('Solo el dueño que creó este bar puede cambiar promociones.');
  return { bar, sesion };
}

function esImagenReal(file: File, bytes: Uint8Array) {
  if (file.type === 'image/png') return bytes.length > 24 &&
     [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  if (file.type === 'image/jpeg') return bytes.length > 4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if (file.type === 'image/webp') return bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return false;
}

export async function guardarPromocionAction(formData: FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  const file=formData.get('imagen');
  if (!(file instanceof File) || file.size<100 || file.size>3*1024*1024) {
    redirect(`${ruta(code)}?error=imagen`);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) redirect(`${ruta(code)}?error=storage`);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if (!esImagenReal(file,bytes)) redirect(`${ruta(code)}?error=formato`);
  const placement=String(formData.get('placement')??'espera');
  const titulo=String(formData.get('titulo')??'').trim();
  if (!titulo || titulo.length>90) redirect(`${ruta(code)}?error=titulo`);
  const starts=String(formData.get('inicioIso')??'').trim();
  const ends=String(formData.get('finIso')??'').trim();
  const input={
    title:titulo,placement,
    duration_seconds:Number(formData.get('duracion')??10),
    priority:Number(formData.get('prioridad')??0),
    starts_at:starts||null,ends_at:ends||null,
  };
  let blob;
  try {
    const ext=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
    blob=await put(`karyou-bar/${bar.id}/promos/${crypto.randomUUID()}.${ext}`, file, {
      access:'public', addRandomSuffix:true, contentType:file.type,
    });
  } catch (error) {
    console.error('Karyou Bar Ads: no se pudo subir la imagen',error instanceof Error?error.message:'error');
    redirect(`${ruta(code)}?error=subida`);
  }
  try {
    await crearCampania(bar.id,input,{url:blob.url,pathname:blob.pathname,contentType:file.type});
  } catch (error) {
    console.error('Karyou Bar Ads: no se pudo registrar la campaña',error instanceof Error?error.message:'error');
    redirect(`${ruta(code)}?error=registro`);
  }
  revalidatePath(ruta(code));
  redirect(`${ruta(code)}?ok=creada`);
}

export async function estadoPromocionAction(formData:FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  const id=Number(formData.get('id'));
  const status=String(formData.get('status')??'');
  await cambiarEstadoCampania(bar.id,id,status);
  revalidatePath(ruta(code));
  revalidatePath(`/sala/${code}/tv`);
  redirect(ruta(code));
}

export async function marcaBarAction(formData:FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  await actualizarMarcaBar(bar.id,String(formData.get('nombre')??''));
  revalidatePath(ruta(code));
  revalidatePath(`/sala/${code}/tv`);
  redirect(ruta(code));
}

export async function logoBarAction(formData:FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  if (!process.env.BLOB_READ_WRITE_TOKEN) redirect(`${ruta(code)}?error=storage`);
  const file=formData.get('logo');
  if(!(file instanceof File) || file.size>1024*1024 || file.size<50) redirect(`${ruta(code)}?error=imagen`);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!esImagenReal(file,bytes)) redirect(`${ruta(code)}?error=formato`);
  const ext=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp';
  const blob=await put(`karyou-bar/${bar.id}/logo-${crypto.randomUUID()}.${ext}`,file,
    {access:'public',addRandomSuffix:true,contentType:file.type});
  await actualizarLogoBar(bar.id,blob.url);
  revalidatePath(ruta(code));
  revalidatePath(`/sala/${code}/tv`);
  redirect(`${ruta(code)}?ok=logo`);
}

export async function editarPromocionAction(formData:FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  const id=Number(formData.get('id'));
  const input={
    title:String(formData.get('titulo')??''),
    placement:String(formData.get('placement')??'espera'),
    duration_seconds:Number(formData.get('duracion')??10),
    priority:Number(formData.get('prioridad')??0),
    starts_at:String(formData.get('inicioIso')??'')||null,
    ends_at:String(formData.get('finIso')??'')||null,
  };
  await editarCampania(bar.id,id,input);
  revalidatePath(ruta(code));
  revalidatePath(`/sala/${code}/tv`);
  redirect(`${ruta(code)}?ok=editada`);
}

export async function eliminarPromocionAction(formData:FormData) {
  const code=normalizarCodigo(String(formData.get('code')??''));
  const {bar}=await autorizacion(code);
  const id=Number(formData.get('id'));
  const imagen=await campaniaDelBar(bar.id,id);
  if(!imagen) redirect(ruta(code));
  // Evita eliminar la referencia en BD si Blob no puede borrarse.
  if(!process.env.BLOB_READ_WRITE_TOKEN) redirect(`${ruta(code)}?error=storage`);
  try { await del(imagen.blob_path); }
  catch(e) {
    console.error('Karyou Ads: fallo al eliminar Blob',e instanceof Error?e.message:'error');
    redirect(`${ruta(code)}?error=eliminar`);
  }
  await eliminarCampania(bar.id,id);
  revalidatePath(ruta(code));
  revalidatePath(`/sala/${code}/tv`);
  redirect(`${ruta(code)}?ok=eliminada`);
}
