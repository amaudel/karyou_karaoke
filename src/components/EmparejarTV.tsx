'use client';
import { useState } from 'react';
import { crearAccesoTvAction } from '@/app/sala/actions';

export default function EmparejarTV({code}: {code:string}) {
  const [url,setUrl] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function generar() {
    setBusy(true); setError('');
    try {
      const token = await crearAccesoTvAction(code);
      setUrl(`${window.location.origin}/sala/${encodeURIComponent(code)}/tv/activar?token=${token}`);
    } catch { setError('No se pudo crear el acceso de TV.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-purple-500/40 bg-purple-950/40 p-4 space-y-3">
    <h2 className="font-bold">📺 Vincular una televisión</h2>
    <p className="text-sm text-purple-200">Genera un enlace privado para abrir la TV desde otro dispositivo. Al generar uno nuevo, el anterior queda revocado. No lo compartas con participantes.</p>
    <button type="button" disabled={busy} onClick={generar} className="rounded-xl bg-purple-600 px-4 py-2 font-bold disabled:opacity-50">{busy?'Generando…':'Generar enlace privado para TV'}</button>
    {url && <div className="space-y-2"><a href={url} target="_blank" rel="noreferrer" className="block break-all text-sm text-cyan-200 underline">Abrir TV autorizada</a>
      <button type="button" className="rounded-lg border border-purple-400 px-3 py-2 text-sm" onClick={()=>navigator.clipboard.writeText(url)}>Copiar enlace</button>
      <p className="text-xs text-amber-200">Este enlace concede control de reproducción. Guárdalo como una contraseña.</p></div>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
  </section>;
}
