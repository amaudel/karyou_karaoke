import Link from 'next/link';
import { usuarioBar } from '@/lib/auth/server';
import { barDeCuenta } from '@/db/bar-accounts.mjs';
import { getDb } from '@/db/client.mjs';
import { entrarBar, registrarBar, salirBar, crearBar, recuperarClave } from './actions';

export const dynamic = 'force-dynamic';
const campo = 'w-full rounded-xl border border-purple-500/40 bg-purple-950/60 p-3 text-white';
const boton = 'rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-500';

export default async function CuentaBar({ searchParams }: { searchParams: Promise<{ error?: string; mensaje?: string }> }) {
  const query = await searchParams;
  const configurado = Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
  const user = configurado ? await usuarioBar() : null;
  const bar = user ? await barDeCuenta(user.id) : null;
  const salas = bar ? await (await getDb()).prepare(`select s.code, s.name, s.status from sessions s join bar_rooms r on r.session_id=s.id where r.venue_id=? order by s.id desc`).all(bar.id) : [];
  return <main className="mx-auto max-w-3xl space-y-6 p-6 text-white">
    <Link href="/" className="text-purple-200">← Volver a Karyou</Link>
    <h1 className="text-3xl font-black">Cuenta para bares</h1>
    {!configurado && <p>El acceso para bares aún no está configurado.</p>}
    {query.error && <p role="alert" className="rounded-xl bg-red-900/50 p-3">{query.error === 'correo' ? 'El servicio de correo todavía no está configurado.' : query.error === 'clave' ? 'La contraseña debe tener al menos 8 caracteres.' : query.error === 'nombre' ? 'Escribe un nombre válido para el bar.' : 'No se pudo completar la operación. Revisa tus datos e inténtalo de nuevo.'}</p>}
    {query.mensaje === 'recuperacion' && <p>Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.</p>}
    {query.mensaje === 'actualizada' && <p>Tu contraseña se actualizó correctamente.</p>}
    {query.mensaje === 'confirma' && <p>Revisa tu correo para confirmar la cuenta y luego inicia sesión.</p>}
    {configurado && !user && <div className="grid gap-5 sm:grid-cols-2">
      <form action={entrarBar} className="space-y-3 rounded-2xl border border-purple-500/30 p-5"><h2 className="text-xl font-bold">Ingresar</h2><label>Correo<input className={campo} type="email" name="email" required /></label><label>Contraseña<input className={campo} type="password" name="password" required /></label><button className={boton}>Ingresar</button></form>
      <form action={registrarBar} className="space-y-3 rounded-2xl border border-purple-500/30 p-5"><h2 className="text-xl font-bold">Crear cuenta</h2><label>Correo<input className={campo} type="email" name="email" required /></label><label>Contraseña<input className={campo} type="password" name="password" minLength={8} required /></label><button className={boton}>Crear cuenta</button></form>
    </div>}
    {configurado && !user && <details className="rounded-2xl border border-purple-500/30 p-5"><summary className="cursor-pointer font-bold">¿Olvidaste tu contraseña?</summary><form action={recuperarClave} className="mt-4 space-y-3"><label>Correo<input className={campo} type="email" name="email" required /></label><button className={boton}>Enviar enlace</button></form></details>}
    {user && <><form action={salirBar}><button className="text-purple-200 underline">Cerrar sesión</button></form>
      {!bar ? <form action={crearBar} className="space-y-4"><h2 className="text-xl font-bold">Configura tu bar</h2><label>Nombre del establecimiento<input className={campo} name="nombre" minLength={2} maxLength={100} required /></label><button className={boton}>Guardar bar</button></form> : <><h2 className="text-2xl font-bold">{bar.name}</h2><p>Para abrir una nueva sala, selecciona Modo Bar en la página principal mientras tu sesión está iniciada.</p><Link className={boton} href="/#crear-sala">Crear sala</Link><h3 className="pt-4 text-xl font-bold">Mis salas</h3>{salas.length === 0 ? <p>Aún no tienes salas.</p> : <ul className="space-y-3">{salas.map((s: { code: string; name: string; status: string }) => <li key={s.code} className="rounded-xl border border-purple-500/30 p-4"><strong>{s.name}</strong> · {s.code} · {s.status}<div className="mt-2 flex gap-4"><Link href={`/sala/${s.code}/control`}>Administrar</Link><Link href={`/sala/${s.code}/control/publicidad`}>Promociones</Link><Link href={`/sala/${s.code}/tv`}>TV</Link></div></li>)}</ul>}</>}
    </>}
  </main>;
}
