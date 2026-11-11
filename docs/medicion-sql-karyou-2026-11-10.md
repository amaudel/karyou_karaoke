# Mejora #4 — Instrumentación SQL (10 noviembre 2026)

## Alcance

Instrumentación opt-in en la capa compartida `getDb()`, incluyendo sentencias `get/all/run` dentro y fuera de transacciones. Se usa `AsyncLocalStorage` para aislar métricas entre peticiones concurrentes y salas distintas; las rutas `/sala/[code]` (participante) y `/sala/[code]/tv` (TV) registran agregados por render.

**Activación:** establecer `KARYOU_SQL_METRICS=1` únicamente en un entorno de pruebas/staging controlado. Por defecto está desactivada. No requiere migraciones ni cambios de esquema. No activar indiscriminadamente en producción: genera una línea por render, con posible volumen elevado.

**Formato:** una línea JSON con `evento=karyou_sql_metrics`, `ruta` (solo participante/tv), `motor` (desconocido si no se configura), `consultas`, `errores`, `sqlMs`, `p50SqlMs`, `p95SqlMs` y `renderMs`. No se registran SQL, parámetros, tokens, identificadores de salas ni filas. El p95 es el de las consultas **dentro de un render**, no el p95 global de la aplicación. `sqlMs` suma duraciones de consultas, incluso cuando se ejecutan en paralelo, por lo que puede superar `renderMs`.

## Pruebas reproducibles

Ejecutar `npm run test:sqlite`, `npm run test:libsql`, `npm run typecheck` y `npm run build`. El runner `tests/all.mjs` importa `tests/app.test.mjs`, que crea una base efímera con migraciones reales, ejecuta dos salas simultáneas y comprueba aislamiento, conteos, no exposición de códigos y apagado por defecto. **libSQL local no equivale a Turso remoto**.

## Cómo medir en staging

1. En una instancia aislada, habilitar la variable, abrir la sala de pruebas con participantes autenticados y la TV emparejada.
2. Capturar líneas JSON durante 5 minutos para cada pantalla, con una sala y con 10 salas simuladas; no usar datos reales ni registrar cookies.
3. Comparar media y p95 de `consultas`, `renderMs`, y tasas de error por ruta, con igual carga antes/después. Identificar picos al cambiar canciones, puntuar y pasar a espera.
4. Mantener la instrumentación desactivada en producción hasta definir muestreo y retención.

## Límites

El PR incorpora medición **ejecutable**, pero no presenta cifras de latencia de Turso remoto: no se ha corrido una carga de staging. Los tests verifican el comportamiento de la instrumentación y su aislamiento; los valores numéricos de rendimiento dependen del entorno. La medición no añade un endpoint de cambios ni modifica el polling.
