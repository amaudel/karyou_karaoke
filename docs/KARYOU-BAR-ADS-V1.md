# Karyou Bar Ads V1 — Operación y puesta en escena

## Propósito
Promociones propias del establecimiento, diseñadas fuera de Karyou (ChatGPT, Canva, agencia), subidas como imágenes JPG/PNG/WebP y presentadas SIN rehacer ni recortar la creatividad. Solo Modo Bar.

## Almacenamiento
- Turso: `009_bar_ads.sql` crea `bar_venues`, `bar_rooms`, `bar_campaigns`, `bar_impressions` e índices.
- Las rutas Ads pueden inicializar idempotentemente sus tablas en Turso si la migración aún no se ha ejecutado en producción.
- Vercel Blob (store público) guarda archivos y devuelve URL. No se guardan imágenes grandes en SQLite.
- Requiere Vercel Blob conectado al proyecto **karyou-karaoke**. Se admite la integración OIDC moderna (`BLOB_STORE_ID` y credenciales efímeras que Vercel emite automáticamente a las funciones), o el esquema anterior `BLOB_READ_WRITE_TOKEN`. No crear ni compartir claves permanentes cuando OIDC ya esté configurado. Nunca poner credenciales en variables `NEXT_PUBLIC_*`.
- Límite de imágenes de campaña: 3 MB. Logo: 1 MB. Se valida MIME y firma binaria.
- Si falta Blob, las pantallas existentes siguen funcionando; el administrador ve carga deshabilitada.

## Seguridad del propietario
- Cuando el creador abre una **nueva sesión** en Modo Bar, el servidor genera 32 bytes aleatorios y deja una cookie `karyou_bar_owner` HTTP-only, SameSite=Strict y Secure en producción.
- Solo se almacena en BD SHA-256 del token. Las Server Actions de crear, editar, activar, pausar, eliminar o cambiar el logo comprueban bar/room + cookie.
- Las nuevas noches creadas desde el mismo navegador reutilizan campañas. El código público de la sala NO concede permisos de anuncios.
- Por seguridad, las salas Bar anteriores a esta actualización no pueden ser reclamadas únicamente con su código. El dueño debe abrir otra sesión desde su navegador administrador.
- La recuperación de credenciales entre dispositivos y usuarios secundarios requiere un sistema de autenticación formal en una fase futura. Evitar limpiar cookies del navegador propietario.

## Modo de presentación de imágenes
1. **Spotlight — sala sin canciones:** bloque principal junto al QR, imagen completa sin recortar. 8–12 s.
2. **Tarjeta — siguiente cantante esperando:** panel lateral en TV con foto completa; el próximo turno nunca se retrasa y al empezar canción desaparece.
3. **Firma — celebración de resultado:** solo marca/nombre del bar y título corto en la zona inferior durante los 3,2 s finales de los 8,7 s de animación. Nunca un flyer grande encima de la nota.
4. **Durante canción:** sin imagen superpuesta al iframe de YouTube.

Las promos se filtran por estado `active`, fecha UTC vigente y propietario del establecimiento; el orden sigue prioridad e ID. La intensidad visual de Karyou sigue controlada por Discreto/Fiesta/Épico.

## Gestión
- Nueva URL: `/sala/<CODIGO>/control/publicidad`
- Crear borrador, activar, pausar, editar nombre/duración/ubicación/prioridad, eliminar (incluido Blob), cambiar nombre y subir logo del bar.
- El editor advierte baja resolución. Los horarios del formulario se convierten de hora local a UTC antes del envío.
- Para cambiar imagen o fechas, reemplazar la campaña existente por una nueva.
- La tabla de impresiones queda reservada para analítica posterior; **no afirmar métricas de espectadores o ventas**, ni contar visualizaciones mientras no se instrumenten.

## Despliegue seguro
1. Confirmar CI (`pnpm test`, `pnpm run typecheck`, `pnpm run build`).
2. Confirmar vista previa Vercel y recursos de TV.
3. Conectar Vercel Blob al proyecto (el conector puede no tener autorización para crear almacenes).
4. Desplegar sin cambiar el motor de puntuación.
5. Crear una **sala Bar nueva** desde el navegador del administrador. Publicar una imagen de prueba, activar y verificar rotación, pausa, horarios y no interrupción de YouTube.
6. No utilizar publicidad de terceros ni superposiciones durante la reproducción.
