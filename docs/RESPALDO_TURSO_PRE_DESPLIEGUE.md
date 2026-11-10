# Respaldo de Turso previo al despliegue — KARYOU

Estado: **PENDIENTE**. Este documento no certifica que exista una copia.

## Seguridad
- No pegar TURSO_AUTH_TOKEN en ChatGPT, issues, PR, capturas ni logs.
- No crear rutas HTTP públicas para exportar la base.
- No ejecutar migraciones ni desplegar la rama de seguridad antes del respaldo.
- No guardar el archivo de respaldo dentro del repositorio.

## Procedimiento
1. Entrar en la cuenta de Turso que administra la base conectada a KARYOU.
2. Identificar la base de producción y verificar que corresponde a la URL configurada en Vercel, sin exponer su token.
3. Utilizar la opción de respaldo/exportación consistente que ofrezca Turso para esa base. Si no está disponible, documentar la limitación y seleccionar un mecanismo compatible antes de proceder.
4. Guardar la copia en almacenamiento privado fuera del repositorio, con fecha, identificador de base y suma SHA-256.
5. Restaurar la copia en una base temporal **distinta de producción** y comparar tablas, conteos y resultado de comprobación de integridad.
6. Registrar la evidencia y la ruta privada del respaldo (sin secretos) en el registro de cambios.
7. Solo después, ejecutar pruebas en la rama y evaluar despliegue.

## Auditoría opcional de solo lectura
El script `scripts/auditar-turso-readonly.mjs` lista nombres de tablas, sus conteos y PRAGMA quick_check. Se ejecuta en un entorno privado que ya tenga las variables Turso. No exporta filas ni crea un respaldo. No requiere ni justifica desplegarlo a producción.

## Criterio de aprobación
- Copia consistente creada y almacenada de forma privada.
- Restauración probada en entorno separado.
- Comparación de estructura y conteos satisfactoria.
- Pruebas de aplicación y build exitosas.
- Revisión de seguridad del acceso de TV completada.

Hasta cumplir estos puntos, mantener PR #32 en borrador y producción intacta.
