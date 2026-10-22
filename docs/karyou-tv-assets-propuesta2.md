# Karyou TV — Recursos de la propuesta 2

**Estado: integrados en producción.** Los seis recursos WebP se importaron correctamente en el PR #13, fusionado en `main` el 22 de octubre de 2026. Los archivos ya están en el repositorio y no requieren una nueva subida.

## Recursos verificados

- `public/images/karyou/trofeo-microfono.webp`
- `public/images/karyou/escenario.webp`
- `public/images/karyou/podio.webp`
- `public/images/karyou/tarjeta-horizontal.webp`
- `public/images/karyou/tarjeta-vertical.webp`
- `public/images/karyou/confeti.webp`

El importador temporal del PR #13 se retiró después de comprobar la transferencia. No debe volver a ejecutarse ni copiarse a producción.

La pantalla usa esos recursos en `src/components/AnimacionResultado.tsx` y `src/app/globals.css`. Conserva dinámicos el cantante, canción, las tres métricas recreativas, nota final, posición y revancha. El micrófono y el podio son imágenes decorativas con `alt=""`.

## Control de calidad

- Transferencia de los seis archivos: **verificada en el árbol de `main`**.
- CI final del PR #13: **aprobada** (commit `067c17b92`).
- Vercel: despliegue de producción más reciente consultado en estado **READY**.
- Validación visual en TV física a 1920 × 1080, 1366 × 768 y 900 × 506: **pendiente de comprobación presencial**.
- Los fallos de CI y previews intermedios no representan el estado final del PR; se resolvieron antes de fusionar.
- El acceso a errores agrupados en Vercel devolvió HTTP 403; **no se han verificado logs de ejecución**.

No se realizaron migraciones por esta integración de recursos. Los cambios posteriores a este PR se gestionan por separado.
