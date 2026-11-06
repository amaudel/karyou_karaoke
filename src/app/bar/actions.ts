'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor, usuarioBar } from '@/lib/supabase/server';
import { crearBarParaCuenta } from '@/db/bar-accounts.mjs';

export async function entrarBar(form: FormData) {
  const auth = await supabaseServidor();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error) redirect('/bar?error=acceso');
  redirect('/bar');
}

export async function registrarBar(form: FormData) {
  const auth = await supabaseServidor();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (password.length < 8) redirect('/bar?error=clave');
  const { data, error } = await auth.auth.signUp({ email, password });
  if (error) redirect('/bar?error=registro');
  if (!data.session) redirect('/bar?mensaje=confirma');
  redirect('/bar');
}

export async function salirBar() {
  const auth = await supabaseServidor();
  await auth.auth.signOut();
  redirect('/bar');
}

export async function crearBar(form: FormData) {
  const user = await usuarioBar();
  if (!user) redirect('/bar');
  try { await crearBarParaCuenta(user.id, form.get('nombre')); }
  catch { redirect('/bar?error=nombre'); }
  redirect('/bar');
}
