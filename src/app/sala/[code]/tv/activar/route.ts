import { NextRequest, NextResponse } from 'next/server';
import { obtenerSesion, normalizarCodigo } from '@/db/sessions.mjs';
import { verifyTvToken, tvCookieName } from '@/db/tv-access.mjs';

export async function GET(request: NextRequest, { params }: { params: Promise<{code:string}> }) {
  const code = normalizarCodigo((await params).code);
  const token = request.nextUrl.searchParams.get('token');
  const sesion = await obtenerSesion(code);
  if (!sesion || !(await verifyTvToken(sesion.id, token))) {
    return new NextResponse('Enlace de TV inválido o revocado', { status: 403, headers: {'Cache-Control':'no-store'} });
  }
  const response = NextResponse.redirect(new URL(`/sala/${code}/tv`, request.url));
  response.cookies.set(tvCookieName(code), token!, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
