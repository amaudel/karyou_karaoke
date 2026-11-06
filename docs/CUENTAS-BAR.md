# Cuentas para bares: piloto

Cada usuario autenticado puede crear un establecimiento. Sus salas se vinculan al establecimiento y sus promociones se gestionan desde la sala. El acceso de las salas existentes basadas en cookie se conserva; no se traspasan automáticamente a una cuenta.

## Configuración para pruebas

1. Usar un proyecto Supabase Auth exclusivo para Karyou; no utilizar el proyecto de NidoCerca. Configurar correo de confirmación y URLs de redirección para el dominio del entorno de prueba.
2. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no colocar una clave secreta de servicio en variables públicas.
3. Aplicar todas las migraciones SQLite en una copia de la base, incluida `013_cuentas_bar.sql`. En Turso de producción preparar respaldo y procedimiento de aplicación antes de activar el código. La migración no transfiere ni elimina datos.
4. Crear dos cuentas confirmadas y un establecimiento por cuenta; comprobar creación, acceso desde otro navegador, QR, control, TV, promociones y denegación cruzada. La TV de una sala con cuenta debe tener iniciada la cuenta del bar; los cantantes se unen por QR sin cuenta.
5. Comprobar límite de correos, recuperación de contraseña y configuración del servicio de email antes de ofrecer registro a clientes. Se debe probar el flujo de recuperación con el servicio de correo configurado.

El registro sin cuenta y salas antiguas permanecen disponibles para compatibilidad. No habilitar venta masiva hasta validar autenticación real, recuperación de cuenta, pruebas en dispositivos, configuración de producción y la fuente comercial de música.

## Plantillas de correo para confirmación y recuperación

Configurar el Site URL en el dominio exacto del entorno. Las plantillas de Supabase Auth deben incluir, respectivamente, `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` y `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. El servidor verifica cada token y usa redirecciones internas fijas. Antes de publicar, probar la entrega real y vencimiento de enlaces.
