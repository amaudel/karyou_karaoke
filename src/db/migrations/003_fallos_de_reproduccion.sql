-- 003_fallos_de_reproduccion.sql — aprendizaje de fallos reales
--
-- Motivo: `status.embeddable` de la API de YouTube dice `true` en videos que luego
-- YouTube bloquea al insertarlos, por un reclamo de derechos (Content ID).
--
-- Comprobado el 2026-09-15: «Shakira - Loba» (iM32wVU0TnI, Echoe Entertainment)
-- tiene embeddable = true, es público y no está restringido por región, pero
-- YouTube responde «Este video tiene contenido de LatinAutor - UMPG, quien bloqueó
-- su reproducción en este sitio web o en esta aplicación».
--
-- Ningún campo de la API lo predice: ni `embeddable`, ni `licensedContent`
-- (comprobado: el video bloqueado tiene licensedContent = false y varios de Party
-- Tyme que sí funcionan tienen true). La única señal fiable es intentar reproducir.
--
-- Por eso este estado vive en una columna aparte y NO en `embeddable`:
--   embeddable        = lo que dice la API
--   playback_blocked  = lo que comprobamos al reproducir
-- Así, volver a importar el canal (que reescribe `embeddable` desde la API) no
-- borra lo que la aplicación aprendió.

alter table pool_items add column playback_blocked integer not null default 0
  check (playback_blocked in (0, 1));
alter table pool_items add column fail_count integer not null default 0;
alter table pool_items add column last_error_code text;

-- Índice para el contador de la portada y para encontrar lo bloqueado.
create index if not exists ix_pool_blocked on pool_items(playback_blocked)
  where playback_blocked = 1;
