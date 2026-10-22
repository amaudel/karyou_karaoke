-- Periodo obligatorio de celebración entre canciones.
-- Un registro por sala; reloj absoluto del servidor, no del navegador.
create table if not exists score_ceremonies (
  session_id integer primary key references sessions(id) on delete cascade,
  queue_item_id integer not null references queue_items(id) on delete cascade,
  until_ms integer not null,
  created_at text not null default (datetime('now'))
);
