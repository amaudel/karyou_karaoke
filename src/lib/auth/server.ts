import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { crearAuth } from './core.mjs';

async function enviarCorreo(to: string, subject: string, link: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.KARYOU_EMAIL_FROM;
  if (!key || !from) throw new Error('El servicio de correo no está configurado.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: `${subject}\n\n${link}\n\nSi no solicitaste este mensaje, ignóralo.` }),
  });
  if (!response.ok) throw new Error('No se pudo enviar el correo.');
}

export const auth = crearAuth({ plugins: [nextCookies()], sendEmail: enviarCorreo });
export async function usuarioBar() {
  if (!process.env.BETTER_AUTH_SECRET) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
