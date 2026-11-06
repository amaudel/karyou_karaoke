# Cuentas para bares: piloto

La autenticación usa Better Auth y la base de datos existente Turso (libSQL). Cada cuenta puede crear un establecimiento; sus salas y promociones se vinculan a él. Las salas existentes basadas en cookie se conservan y no se transfieren automáticamente.

## Preparación antes de activar

1. Preparar un entorno separado y una copia o base aislada de Turso. No utilizar la base de NidoCerca. Comprobar y respaldar la base de producción antes de cualquier migración.
2. Aplicar en orden las migraciones SQLite `013_cuentas_bar.sql` y `014_better_auth.sql`. La segunda fue generada con Better Auth 1.7.18 y crea las tablas de usuarios, sesiones, cuentas, verificación y límites. No usar `db:reset` en producción.
3. Configurar `BETTER_AUTH_SECRET` (secreto aleatorio de al menos 32 caracteres) y `BETTER_AUTH_URL` (origen exacto del entorno). Mantener las credenciales Turso en el servidor.
4. Para registro y recuperación, configurar un servicio de correo transaccional compatible: `RESEND_API_KEY` y `KARYOU_EMAIL_FROM`, con remitente de dominio verificado. Sin correo configurado, el registro queda deshabilitado. No usar direcciones o claves de producción en pruebas.
5. Ejecutar `node tests/auth-integration.mjs`, `pnpm test`, `pnpm typecheck` y `pnpm build`. Verificar con dos cuentas reales de prueba en un entorno aislado: confirmación y recuperación por correo, propiedad de salas, promociones, acceso cruzado, QR, TV y sesiones en varios dispositivos.
6. La TV de una sala con cuenta requiere que se inicie sesión con la cuenta del bar en el navegador de la TV. Los cantantes se unen por QR sin cuenta.

Es necesario comprobar respaldo, activación de correo, límites de tráfico, recuperación de cuentas, supervisión y fuente comercial de música antes de ofrecer el servicio. Las salas antiguas se mantienen en modo de compatibilidad y no se asignan automáticamente.
