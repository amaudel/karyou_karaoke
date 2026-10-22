'use client';

import { useEffect, useRef } from 'react';

/** Partículas sin CDN, aisladas del reproductor, limitadas a una celebración. */
export default function ParticulasResultado({ total }: { total: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || total < 78) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const modo = canvas.closest('[data-espectaculo]')?.getAttribute('data-espectaculo') ?? 'fiesta';
    if (modo === 'discreto') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const w = rect.width, h = rect.height;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const colores = ['#fbbf24', '#ec4899', '#a855f7', '#67e8f9', '#fde68a'];
    const cantidad = Math.min(modo === 'epico' ? 100 : 44, 120);
    const particulas = Array.from({ length: cantidad }, (_, i) => {
      const lado = i % 2 === 0 ? 0 : w;
      return {
        x: lado, y: h * (.45 + Math.random() * .24),
        vx: (lado === 0 ? 1 : -1) * (1.2 + Math.random() * 3),
        vy: -2.4 - Math.random() * 3.5,
        girar: Math.random() * 6.28, velocidad: -.11 + Math.random() * .22,
        medida: 3 + Math.random() * 5, color: colores[i % colores.length],
      };
    });
    let frame = 0, raf = 0;
    const inicio = performance.now();
    const duracion = modo === 'epico' ? 2400 : 1500;
    const animar = (ahora: number) => {
      const dt = Math.min((ahora - (frame || ahora)) / 16.67, 2);
      frame = ahora;
      ctx.clearRect(0, 0, w, h);
      const alpha = Math.min(1, (duracion - (ahora - inicio)) / 300);
      ctx.globalAlpha = Math.max(0, alpha);
      for (const p of particulas) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += .075 * dt; p.girar += p.velocidad * dt;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.girar);
        ctx.fillStyle = p.color || '#fbbf24';
        ctx.fillRect(-p.medida / 2, -p.medida / 3, p.medida, p.medida * .65);
        ctx.restore();
      }
      if (ahora - inicio < duracion) raf = requestAnimationFrame(animar);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(animar);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); };
  }, [total]);
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />;
}
