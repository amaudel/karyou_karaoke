import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // node:sqlite es un módulo integrado de Node; no debe intentar empaquetarse.
  serverExternalPackages: ['node:sqlite'],

  // Sin esto, Next encuentra un package-lock.json en la carpeta del usuario y deduce
  // que la raíz del proyecto está ahí, lo que rompe el trazado de archivos del build.
  outputFileTracingRoot: path.resolve(process.cwd()),

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // OBLIGATORIO. El reproductor de YouTube exige identificarse por la cabecera
          // Referer. Poner `no-referrer` rompe el embed con el error 153 y parece un
          // problema del catálogo cuando en realidad es una cabecera.
          // YouTube usa este mismo valor en su propio código de inserción (oEmbed).
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
