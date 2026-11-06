import Link from 'next/link';
import { cambiarClave } from '../actions';

export const dynamic = 'force-dynamic';
export default async function NuevaClave({ searchParams }: {searchParams: Promise<{error?: string; token?: string}>}) {
  const { error, token } = await searchParams;
  return <main className="mx-auto max-w-md space-y-5 p-6 text-white">
    <Link href="/bar" className="text-purple-200">← Volver</Link>
    <h1 className="text-3xl font-black">Crear nueva contraseña</h1>
    {error && <p role="alert">Revisa que las contraseñas coincidan y tengan al menos 8 caracteres.</p>}
    <form action={cambiarClave} className="space-y-4">
      <input type="hidden" name="token" value={token ?? ''} />
      <label className="block">Nueva contraseña<input className="w-full rounded-xl border border-purple-500/40 bg-purple-950/60 p-3" type="password" name="password" minLength={8} required /></label>
      <label className="block">Repetir contraseña<input className="w-full rounded-xl border border-purple-500/40 bg-purple-950/60 p-3" type="password" name="confirmacion" minLength={8} required /></label>
      <button className="rounded-xl bg-purple-600 px-5 py-3 font-bold">Guardar contraseña</button>
    </form>
  </main>;
}
