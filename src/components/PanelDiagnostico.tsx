'use client';

import { useEffect, useState } from 'react';
import { diagnosticoActivo, obtenerRegistro } from '@/lib/diagnostico-reproductor.mjs';

/**
 * Panel de diagnóstico del reproductor. Solo existe con `?debug=1` en la URL; sin
 * eso no dibuja nada. Va en el flujo de la página, plegado y debajo de los
 * controles, nunca encima del video.
 *
 * Muestra los últimos eventos y permite copiar o descargar el registro completo para
 * compartirlo. No contiene datos personales (ver diagnostico-reproductor.mjs).
 */
export default function PanelDiagnostico() {
  // Se decide tras montar: leer la URL durante el render rompería la hidratación.
  const [activo, setActivo] = useState(false);
  const [lineas, setLineas] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    setActivo(diagnosticoActivo());
  }, []);

  useEffect(() => {
    if (!activo) return;
    const refrescar = () => {
      const registro = obtenerRegistro();
      if (!registro) return;
      const eventos = registro.eventos();
      setTotal(eventos.length);
      setLineas(
        eventos.slice(-25).map((e) => {
          const { hora, tipo, msDesdeInicio: _ms, ...resto } = e as Record<string, unknown>;
          return `${String(hora).slice(11, 19)} ${String(tipo)} ${JSON.stringify(resto)}`;
        }),
      );
    };
    refrescar();
    const id = window.setInterval(refrescar, 1000);
    return () => window.clearInterval(id);
  }, [activo]);

  if (!activo) return null;

  const copiar = async () => {
    const texto = obtenerRegistro()?.texto() ?? '';
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(`Copiado (${texto.split('\n').length} líneas).`);
    } catch {
      setAviso('No se pudo copiar. Usa Descargar.');
    }
  };

  const descargar = () => {
    const texto = obtenerRegistro()?.texto() ?? '';
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `karyou-diagnostico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    enlace.click();
    URL.revokeObjectURL(url);
    setAviso('Descargado.');
  };

  return (
    <details className="rounded-xl border border-cyan-500/30 bg-slate-950/70 p-3 text-xs text-cyan-100">
      <summary className="cursor-pointer font-bold">🐞 Diagnóstico del reproductor · {total} eventos</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copiar} className="rounded-lg border border-cyan-400/50 px-3 py-1.5 font-bold">
          Copiar registro
        </button>
        <button type="button" onClick={descargar} className="rounded-lg border border-cyan-400/50 px-3 py-1.5 font-bold">
          Descargar .txt
        </button>
        {aviso && <span role="status">{aviso}</span>}
      </div>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug">
        {lineas.join('\n') || 'Esperando eventos…'}
      </pre>
    </details>
  );
}
