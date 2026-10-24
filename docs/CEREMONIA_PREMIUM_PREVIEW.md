# KARYOU · Ceremonia premium como opción predeterminada

## Punto de retorno verificado
- Respaldo GitHub: `backup/karyou-estable-antes-remotion-2026-10-23`
- Commit previo en producción: `c36fee6913ab7f194e938b3d30faf72f7b6e4e20`
- Deployment Vercel anterior: `dpl_DVsvTViURZatZ9YFwesN1HTHdzrj`

**No eliminar ni mover esa rama.** La animación existente sigue intacta.

## Qué se integró
Se adaptó el concepto visual 1920x1080 del ZIP Remotion a un componente React
capaz de pintar una nota diferente por actuación en la TV. La salida es dinámica,
no un MP4 fijo ni un `@remotion/player` que añada dependencias a toda la app.

Solo usa el resultado real `ResultadoVista` y las campañas elegibles de Karyou
Bar Ads; las imágenes publicitarias del dueño se presentan con `object-fit:contain`.
No mide afinación ni toca los cálculos del motor. Las señales gráficas tipo
ecualizador son decoración, no una medición de voz.

La duración de 8700ms se lee de la fuente única existente:
0–1400 suspense; 1400–3200 métricas; 3200–5500 nota;
5500–8700 rango, patrocinador y confeti. Respeta el bloqueo de Play existente;
**nunca inicia el siguiente turno**.

## Cómo probar
- La nueva ceremonia es predeterminada en `/sala/CODIGO/tv` en todos los entornos.
- Para ver temporalmente la animación anterior: `/sala/CODIGO/tv?ceremonia=clasica`.
- La ruta de demostración sintética `/demo/ceremonia` sigue deshabilitada en producción.
- La variante premium funciona tanto con cola como sin cola, y activa `100 PERFECTO`
  únicamente con la puntuación real de 100/100.
- La ceremonia usa `sessionStorage` por ID del resultado para reanudar el tiempo
  tras cambios de árbol cuando llega una canción a una cola inicialmente vacía.
  Una recarga de pantalla no reinicia intencionadamente una nota ya vista.

## Plan de validación manual de la sustitución
1. Comprobar demo 94/73/100 puntos y sponsor on/off a pantalla completa.
2. En Modo Casa: finalizar tres turnos con canciones diferentes, confirmar rango,
   nota y tres subpuntajes del servidor.
3. En Modo Bar: finalizar una canción con dos en espera, intentar Play desde celular,
   TV y panel; no debe comenzar hasta concluir 8,7s y un gesto explícito.
4. Probar sin cola; añadir canción mientras se revela la última nota.
5. Publicidad: sin patrocinio, con imagen elegible, con campaña fuera de vigencia;
   la imagen debe verse entera, nunca sobre el iframe YouTube.
6. Smart TV real: fluidez, consumo de CPU, sonido tras activar audio, tamaño legible.
7. Comprobar que el modo clásico sigue disponible y que no hay autoplay.

## Volver a lo anterior
La rama de restauración conserva el commit y el deployment anterior. Si se decide
publicar el premium y luego revertir, preferir revertir solo los commits de esta
función (sin sobrescribir otros cambios independientes); cuando corresponda,
el deployment `dpl_DVsvTViURZatZ9YFwesN1HTHdzrj` sigue registrado para rollback.

**Precaución:** el respaldo congela código y deployment, no los datos de Turso.
La sustitución no introduce migraciones ni altera tablas.
