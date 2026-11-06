import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('La autenticación de Karyou no está configurada.');
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return jar.getAll(); },
      setAll(toSet) {
        try { toSet.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* La renovación se realiza en middleware. */ }
      },
    },
  });
}

export async function usuarioBar() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  const auth = await supabaseServidor();
  const { data, error } = await auth.auth.getUser();
  return error ? null : data.user;
}
