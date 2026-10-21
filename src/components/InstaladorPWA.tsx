'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstaladorPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [esIOS, setEsIOS] = useState(false);
  const [esStandalone, setEsStandalone] = useState(false);
  const [cerrado, setCerrado] = useState(true);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    // 1. Verificar si ya se está ejecutando como app instalada (PWA standalone)
    const enStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);

    setEsStandalone(enStandalone);
    if (enStandalone) return;

    // 2. Verificar si el usuario lo descartó recientemente
    const descartado = localStorage.getItem('karyou_pwa_dismissed');
    if (descartado) return;

    // 3. Detectar iOS Safari
    const ua = window.navigator.userAgent;
    const esIphone = /iPhone|iPad|iPod/.test(ua) && !('MSStream' in window);
    setEsIOS(esIphone);

    // Si es Android/Chrome, escuchar el evento nativo
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCerrado(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Si es iOS y no es standalone, mostrar el aviso sutil tras 2 segundos
    let timer: NodeJS.Timeout | null = null;
    if (esIphone) {
      timer = setTimeout(() => {
        setCerrado(false);
      }, 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleInstalar = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalado(true);
      setCerrado(true);
    }
    setDeferredPrompt(null);
  };

  const handleCerrar = () => {
    setCerrado(true);
    localStorage.setItem('karyou_pwa_dismissed', '1');
  };

  if (esStandalone || cerrado || instalado) {
    return null;
  }

  return (
    <aside
      aria-label="Instalar KARYOU como App"
      className="fixed bottom-3 inset-x-3 z-50 mx-auto max-w-md rounded-2xl border border-pink-500/50 bg-[#120726]/95 p-3.5 shadow-2xl backdrop-blur-md animate-aparecer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-pink-500 text-lg shadow-md shadow-pink-500/20">
            🎤
          </span>
          <div>
            <p className="text-sm font-black text-white">Instala KARYOU</p>
            <p className="text-xs text-purple-200/80">
              {esIOS
                ? 'Úsala en pantalla completa sin la barra del navegador.'
                : 'Ábrela como una app nativa, rápida y a pantalla completa.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCerrar}
          aria-label="Cerrar sugerencia de instalación"
          className="rounded-lg p-1 text-xs font-bold text-purple-300 hover:bg-purple-800/40 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="mt-3">
        {deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstalar}
            className="w-full rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 py-2.5 text-center text-sm font-black text-white shadow-lg transition hover:scale-[1.02] active:scale-[0.98]"
          >
            📲 Instalar en pantalla de inicio
          </button>
        ) : esIOS ? (
          <div className="rounded-xl border border-purple-500/30 bg-purple-950/60 p-2.5 text-xs text-purple-100">
            <span className="font-bold text-pink-300">En Safari iPhone:</span> toca el botón de{' '}
            <strong className="text-white">Compartir ⎋</strong> (abajo al centro) y luego{' '}
            <strong className="text-amber-300">«Agregar a pantalla de inicio ➕»</strong>.
          </div>
        ) : null}
      </div>
    </aside>
  );
}
