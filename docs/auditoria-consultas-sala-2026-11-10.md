# Auditoría incremental de consultas — 2026-11-10

## Hallazgo confirmado

Tanto `/sala/[code]` como `/sala/[code]/tv` ejecutaban `obtenerSesion(code)` al principio del render y después `estadoSesion(code)`, que volvía a ejecutar `obtenerSesion(code)`. Cada invocación ejecuta un `SELECT * FROM sessions WHERE code = ?`.

## Cambio

`estadoSesion(codigo, sesionPrecargada = null)` admite opcionalmente la sesión ya leída. Ambas páginas la reutilizan. Los demás llamadores siguen funcionando sin cambios. Esto elimina **exactamente una consulta de sesión redundante por render de cada ruta afectada**, no una consulta de cada llamada de negocio ni del sistema completo.

Con 1.000 clientes móviles visibles y sondeo de 5–6 s, el ahorro teórico es de 10.000–12.000 consultas SQL por minuto, **solo si todos esos renders llegan a ejecutar el camino autenticado de la sala**. No es un benchmark ni una medición de Turso. En la TV también se ahorra una consulta por render.

## Pruebas

- Prueba de equivalencia de `estadoSesion(code)` y `estadoSesion(code, sesion)` con participante real en el fixture.
- El runner existente ejecuta las pruebas en SQLite y libSQL local. CI y compilación deben quedar verdes antes de fusionar.

## Límites y siguiente fase

No se ha medido p95, latencia, facturación Turso ni el número total de SQL por render. Sigue existiendo el renderizado completo periódico; un endpoint ligero por versión de estado requiere inventariar **todas** las mutaciones de cola, aplausos, puntuaciones, celebraciones, anuncios y estado de sala, además de autorización de TV/participantes y fallback para eventos basados en tiempo. Introducirlo sin esa cobertura podría dejar la TV desactualizada. Primero instrumentar en staging y medir por ruta; luego diseñar una versión monotónica fiable sin filtrar datos privados.

**No desplegar ni fusionar sin validar.**
