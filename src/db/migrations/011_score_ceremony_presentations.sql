-- Confirma una sola vez cuándo apareció la puntuación en la TV.
-- La siguiente puntuación sustituye esta confirmación dentro de la transacción.
create table if not exists score_ceremony_presentations (
  session_id integer primary key references sessions(id) on delete cascade,
  queue_item_id integer not null references queue_items(id) on delete cascade,
  started_at_ms integer not null
);
