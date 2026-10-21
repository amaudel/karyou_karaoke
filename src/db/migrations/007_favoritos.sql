-- 007_favoritos.sql — canciones favoritas para pedir en un toque (Fase 6)
--
-- Permite marcar pistas del pool como favoritas para acceder a ellas de inmediato
-- tanto desde el móvil de los invitados en una sala como desde el catálogo.

create table if not exists favorites (
  video_id   text primary key references pool_items(video_id) on delete cascade,
  created_at text not null default (datetime('now'))
);

create index if not exists ix_favorites_created on favorites(created_at desc);
