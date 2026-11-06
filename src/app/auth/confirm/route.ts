import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

// Los enlaces del correo solo admiten estos dos usos y redirecciones internas fijas.
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  if (hash && (type === 'email' || type === 'recovery')) {
    const auth = await supabaseServidor();
    const { error } = await auth.auth.verifyOtp({ token_hash: hash, type });
    if (!error) return NextResponse.redirect(new URL(type === 'recovery' ? '/bar/nueva-clave' : '/bar', request.url));
  }
  return NextResponse.redirect(new URL('/bar?error=enlace', request.url));
}
