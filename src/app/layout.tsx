import type { Metadata, Viewport } from 'next';
import BarraNavegacion from '@/components/BarraNavegacion';
import InstaladorPWA from '@/components/InstaladorPWA';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#070312',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'KARYOU · Karaoke Party',
  description: 'Karaoke en casa y bar: búsqueda, cola de turnos desde el móvil y pantalla de TV.',
  applicationName: 'KARYOU',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KARYOU',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark bg-[#070312]">
      <body className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#070312] text-white selection:bg-pink-500/30">
        <BarraNavegacion />
        <main className="mx-auto w-full max-w-7xl px-2.5 py-3 sm:px-6 sm:py-6">{children}</main>
        <InstaladorPWA />
      </body>
    </html>
  );
}
