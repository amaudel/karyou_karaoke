-- 002_importacion.sql — soporte para importar canales completos
--
-- Añade a `channels` el estado de importación (reanudable) y a `pool_items`
-- la clasificación de si el video parece karaoke.

-- `youtube_id` ya existe desde 001_init.sql.
alter table channels add column uploads_playlist_id text;

-- Reanudación: si la importación se corta, se continúa desde aquí en lugar de
-- volver a gastar cuota enumerando desde el principio. Party Tyme son 10.486
-- videos: rehacerlo cuesta 210 unidades y varios minutos.
alter table channels add column import_cursor text;
alter table channels add column import_started_at text;
alter table channels add column import_finished_at text;
alter table channels add column import_seen integer not null default 0;
alter table channels add column import_kept integer not null default 0;
alter table channels add column import_error text;

-- Clasificación por título. Guardamos TODO lo embebible, aunque no parezca karaoke:
-- así se puede ajustar el filtro después sin volver a gastar cuota, y no se pierden
-- canciones por un filtro demasiado agresivo.
--   strong = dice explícitamente karaoke/instrumental/playback
--   weak   = no lo dice pero el canal es de karaoke
--   none   = nada indica que sea karaoke
alter table pool_items add column karaoke_match text not null default 'weak'
  check (karaoke_match in ('strong', 'weak', 'none'));

alter table pool_items add column definition text;
alter table pool_items add column published_at text;
alter table pool_items add column rejected_reason text;

create index if not exists ix_pool_karaoke on pool_items(karaoke_match, embeddable);
