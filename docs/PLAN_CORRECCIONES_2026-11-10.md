# KARYOU — Plan de corrección controlado (2026-11-10)

## Estado y alcance
- Rama de referencia creada: `backup/pre-correcciones-2026-11-10` (snapshot de `main` al crearla; **no confirmado** como commit exacto de producción).
- Rama de trabajo: `fix/seguridad-karyou-fase-1`.
- **Producción Vercel sin modificaciones por este procedimiento.**
- Verificación del deployment de producción pendiente: la API de Vercel devolvió 403 para listar deployments y 404 al consultar el proyecto con el ámbito suministrado.
- Respaldo de datos Turso **pendiente**. No ejecutar migraciones ni mutaciones de datos antes de obtenerlo.

## Puerta de entrada — congelación verificable
1. Identificar el deployment actualmente asignado al dominio de producción y su SHA exacto.
2. Crear una referencia inmutable del commit de producción (tag) y registrar deployment ID/URL.
3. Exportar y verificar un respaldo recuperable de Turso, sin incluir secretos en el repositorio.
4. Registrar pruebas de humo: creación/entrada de sala, reproducción, cola, puntuación, TV, bar, promociones y eliminación autorizada.
5. No confundir snapshot del código con backup de datos ni con rollback completo.

## Fase 1 — seguridad (P1)
- Proteger `/sala/[codigo]/control` con credencial del dueño, validada en servidor.
- Aplicar la misma autorización a cada Server Action administrativa, no solo a la página.
- Validar identidad y propiedad del turno en `terminarTurnoMovilAction`.
- Impedir que `iniciarTurnoMovil` inicie una canción fuera del orden y el bloqueo de 60 segundos en Bar.
- Restringir mutaciones globales de pistas y aplicar límites de frecuencia.
- Pruebas negativas: invitado sin credencial, otro participante, cliente manipulado, concurrencia, reintentos y regresiones de TV.

## Fase 2 — integridad de esquema
- Inventario real de migraciones aplicadas en local/Turso.
- Runner versionado con fallo explícito y sin DDL duplicado en runtime, mediante transición compatible.
- Decidir sobre 013/014 únicamente con consumidor de `rev` y medición.

## Fase 3 — rendimiento
- Medir carga y latencia; separar búsqueda del refresco de sala.
- Refresco condicional por versión y cacheo de conteos; evaluar FTS5.
- Comparar carga y tiempos antes/después con escenarios de varios móviles y TV.

## Fase 4 — producto y calidad
- Definir scoring recreativo sin atribuir análisis vocal inexistente.
- Versionar motor, aislar favoritos, corregir estados de interfaz, accesibilidad y CI.

## Fase 5 — comercialización
- Aislamiento por establecimiento, administración, permisos y facturación.
- Validación jurídica de uso de YouTube y derechos de comunicación pública.

## Política de despliegue
- No editar `main` directamente; PR con pruebas y revisión.
- No desplegar a producción sin smoke test, backup y ruta de reversión verificados.
- Rollback de código no implica rollback automático de datos.
