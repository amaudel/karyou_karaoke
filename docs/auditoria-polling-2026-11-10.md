# Auditoría de polling — KARYOU (2026-11-10)

## Estado antes del cambio

- `src/components/Refresco.tsx`: `setInterval(() => router.refresh(), cada)`, sin pausa al ocultar pestaña, sin dispersión de intervalos ni control de conectividad.
- `src/app/sala/[code]/page.tsx`: `<Refresco cada={2000} />` para participantes identificados.
- `src/app/sala/[code]/tv/page.tsx`: `<Refresco cada={2000} />` para TV en espera y con cola.
- Cada `router.refresh()` vuelve a ejecutar la ruta de servidor; además del estado de sala, el render consulta ranking, resultados y otras fuentes. El número exacto de SQL depende del estado y no está instrumentado.

## Medición analítica reproducible (NO es un benchmark de Turso/Vercel)

Para 10 salas × 100 participantes visibles, sin incluir TVs, durante un minuto:

| Métrica | Antes | Después (máximo teórico sin jitter) |
| --- | ---: | ---: |
| Intervalo móvil | 2 s | 5–6 s |
| Refrescos móviles/minuto | 30.000 | 12.000 |
| Reducción de refrescos móviles | — | ≥ 60 % |
| Refrescos de pestañas ocultas | Continúan | 0 periódicos |
| Intervalo TV | 2 s | 2–2,4 s |

Las cifras son proyecciones del temporizador, **no mediciones de consultas SQL ni de latencia real**. No afirmar que el cambio reduce SQL exactamente en 60 %: los Server Actions y otros caminos siguen consultando.

## Implementación

- Pausa en pestañas ocultas y offline, reanudación al recuperar foco/visibilidad/conexión.
- Desfase positivo aleatorio de hasta 20 % para suavizar picos.
- Sondeo móvil a 5 s; TV conserva 2 s nominales por sensibilidad de turnos y puntuación.
- Mantiene `router.refresh()` y el montaje del reproductor: sin WebSockets ni migraciones.
- Prueba determinista de modelo multisala para frecuencia; pruebas de negocio SQLite/libSQL ejecutadas por CI.

## Riesgos y trabajo posterior

- La cola móvil puede tardar hasta ~6 s en reflejar cambios si no se dispara una acción local; validar UX en dispositivos reales.
- Las consultas siguen siendo costosas por render completo; próximo paso: instrumentar conteo SQL por ruta y endpoint ligero con versión de estado de sala, usando ETag o versión monotónica para refrescar solo ante cambios.
- Validar con 10+ salas reales de staging, medir p95, tasa de peticiones y consultas Turso antes de extrapolar capacidad comercial.
- No se han hecho pruebas de carga HTTP de producción ni mediciones reales de Vercel/Turso en este PR.
