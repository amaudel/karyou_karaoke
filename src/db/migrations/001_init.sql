-- 001_init.sql — catálogo y pool de karaoke
--
-- Fase 1: solo el catálogo. Las tablas de sesiones, participantes, cola y scores
-- se añaden en la Fase 4, cuando exista el reproductor.
--
-- Se usa node:sqlite (integrado en Node 24): sin compilación nativa ni dependencias.

create table if not exists channels (
  id            integer primary key,
  -- El handle puede ser nulo: hay canales que excluimos sin haber resuelto su handle.
  handle        text unique,
  name          text    not null,
  -- UC... de YouTube. Se rellena al importar con la API key (Fase 2).
  youtube_id    text,
  -- 1 = oficial del artista/sello · 2 = productor profesional ·
  -- 3 = canal especializado · 4 = usuario individual
  tier          integer not null default 3 check (tier between 1 and 4),
  excluded      integer not null default 0 check (excluded in (0, 1)),
  excluded_note text,
  created_at    text    not null default (datetime('now'))
);

-- El nombre identifica al canal de forma estable; el handle puede faltar.
create unique index if not exists uq_channels_name on channels(name);

-- Todo lo importado de YouTube. Es el índice de búsqueda, NO el catálogo usable:
-- puede haber 20 versiones de la misma canción.
create table if not exists pool_items (
  video_id         text primary key,
  channel_id       integer not null references channels(id) on delete cascade,
  video_title      text    not null,
  artist           text    not null default '',
  song_title       text    not null default '',
  artist_norm      text    not null default '',
  title_norm       text    not null default '',
  -- artist_norm + title_norm juntos: es contra esto que se busca.
  search_blob      text    not null,
  duration_seconds integer,
  embeddable       integer not null default 1 check (embeddable in (0, 1)),
  -- Pureza vocal. Por defecto 'unreviewed': nunca presentar como "sin voz"
  -- algo que no se ha escuchado.
  vocal_class      text    not null default 'unreviewed'
                     check (vocal_class in ('pure', 'backing', 'guide', 'lead', 'unreviewed')),
  checked_at       text,
  imported_at      text    not null default (datetime('now'))
);

create index if not exists ix_pool_channel on pool_items(channel_id);
create index if not exists ix_pool_title   on pool_items(title_norm);
create index if not exists ix_pool_artist  on pool_items(artist_norm);

-- Canción canónica: lo que el usuario eligió cantar.
create table if not exists songs (
  id          integer primary key,
  title       text not null,
  artist      text not null,
  title_norm  text not null,
  artist_norm text not null,
  search_blob text not null,
  active      integer not null default 1 check (active in (0, 1)),
  created_at  text not null default (datetime('now')),
  unique (title_norm, artist_norm)
);

-- Versiones reproducibles de una canción. Una canción puede tener varias: si un
-- video deja de ser embebible, se cambia la principal sin perder historial ni favoritos.
create table if not exists song_sources (
  id         integer primary key,
  song_id    integer not null references songs(id) on delete cascade,
  video_id   text    not null unique,
  channel_id integer references channels(id),
  is_primary integer not null default 0 check (is_primary in (0, 1)),
  priority   integer not null default 100,
  active     integer not null default 1 check (active in (0, 1)),
  created_at text    not null default (datetime('now'))
);

-- Exactamente una fuente principal por canción.
create unique index if not exists uq_song_sources_primary
  on song_sources(song_id) where is_primary = 1;
create index if not exists ix_song_sources_song on song_sources(song_id);
