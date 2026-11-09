import { auth } from '@/lib/auth/server';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);
function listo() {
  return Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32 && process.env.BETTER_AUTH_URL);
}
export async function GET(request: Request) {
  if (!listo()) return new Response('Acceso no configurado', { status: 503 });
  return handler.GET(request);
}
export async function POST(request: Request) {
  if (!listo()) return new Response('Acceso no configurado', { status: 503 });
  if (new URL(request.url).pathname.endsWith('/sign-up/email') && (!process.env.RESEND_API_KEY || !process.env.KARYOU_EMAIL_FROM)) {
    return new Response('Registro temporalmente no disponible', { status: 503 });
  }
  return handler.POST(request);
}
