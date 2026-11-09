'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, usuarioBar } from '@/lib/auth/server';
import { crearBarParaCuenta } from '@/db/bar-accounts.mjs';

export async function entrarBar(form: FormData) {
  let error = false;
  try { await auth.api.signInEmail({ body: { email: String(form.get('email') || '').trim(), password: String(form.get('password') || '') }, headers: await headers() }); }
  catch { error = true; }
  if (error) redirect('/bar?error=acceso');
  redirect('/bar');
}

export async function registrarBar(form: FormData) {
  if (!process.env.RESEND_API_KEY || !process.env.KARYOU_EMAIL_FROM) redirect('/bar?error=correo');
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (password.length < 8) redirect('/bar?error=clave');
  let error = false;
  try { await auth.api.signUpEmail({ body: { email, password, name: email }, headers: await headers() }); }
  catch { error = true; }
  if (error) redirect('/bar?error=registro');
  redirect('/bar?mensaje=confirma');
}

export async function salirBar() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/bar');
}

export async function crearBar(form: FormData) {
  const user = await usuarioBar();
  if (!user) redirect('/bar');
  let error = false;
  try { await crearBarParaCuenta(user.id, form.get('nombre')); }
  catch { error = true; }
  if (error) redirect('/bar?error=nombre');
  redirect('/bar');
}

export async function recuperarClave(form: FormData) {
  if (!process.env.RESEND_API_KEY || !process.env.KARYOU_EMAIL_FROM) redirect('/bar?error=correo');
  try { await auth.api.requestPasswordReset({ body: { email: String(form.get('email') || '').trim(), redirectTo: '/bar/nueva-clave' }, headers: await headers() }); }
  catch { /* Respuesta uniforme para no revelar si existe una cuenta. */ }
  redirect('/bar?mensaje=recuperacion');
}

export async function cambiarClave(form: FormData) {
  const password = String(form.get('password') || '');
  const token = String(form.get('token') || '');
  const confirmacion = String(form.get('confirmacion') || '');
  if (!token || password.length < 8 || password !== confirmacion) redirect('/bar?error=enlace');
  let error = false;
  try { await auth.api.resetPassword({ body: { newPassword: password, token }, headers: await headers() }); }
  catch { error = true; }
  if (error) redirect('/bar?error=enlace');
  redirect('/bar?mensaje=actualizada');
}
