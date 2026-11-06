-- Cada cuenta de autenticación pertenece a un solo establecimiento.
-- Las salas antiguas no se reclaman automáticamente por conocer su código.
create table if not exists bar_accounts (
  auth_user_id text primary key,
  venue_id integer not null unique references bar_venues(id) on delete cascade,
  created_at text not null default (datetime('now'))
);
