-- 004_sesiones_y_cola.sql — sesiones, participantes y cola de turnos
--
-- Una sesión es una noche de karaoke. Los invitados entran sin cuenta: solo un
-- apodo. Su identidad es un token aleatorio guardado en una cookie, que les permite
-- cancelar sus propias peticiones y nada más.

create table if not exists sessions (
  id         integer primary key,
  -- Código corto para dictar en voz alta. Alfabeto Crockford base32, sin
  -- caracteres que se confunden al oído o a la vista (0/O, 1/I/L).
  code       text    not null unique check (code glob '[0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z][0-9A-HJKMNP-TV-Z]'),
  name       text    not null,
  status     text    not null default 'active' check (status in ('active', 'paused', 'finished')),
  created_at text    not null default (datetime('now')),
  ended_at   text
);

create index if not exists ix_sessions_estado on sessions(status, created_at desc);

create table if not exists participants (
  id           integer primary key,
  session_id   integer not null references sessions(id) on delete cascade,
  -- Secreto del invitado. Va en una cookie; sin él no puede cancelar nada.
  token        text    not null unique,
  nickname     text    not null check (length(nickname) between 1 and 24),
  joined_at    text    not null default (datetime('now')),
  last_seen_at text    not null default (datetime('now'))
);

create index if not exists ix_participants_sesion on participants(session_id, joined_at);
-- Dos personas no pueden llamarse igual en la misma sesión: haría imposible saber
-- de quién es cada turno.
create unique index if not exists uq_participants_apodo
  on participants(session_id, lower(nickname));

create table if not exists queue_items (
  id             integer primary key,
  session_id     integer not null references sessions(id) on delete cascade,
  participant_id integer not null references participants(id) on delete cascade,
  video_id       text    not null references pool_items(video_id),
  -- Posición en la cola, 1..N. Es un entero y se renumera al reordenar.
  --
  -- El diseño comercial archivado (docs/archive/ADR-0007) usaba una clave
  -- fraccional para escribir una sola fila al reordenar, porque la cola se
  -- difundía por Realtime a todos los móviles y cada escritura se amplificaba.
  -- Aquí no aplica: la cola es de una fiesta, tiene decenas de filas, la
  -- sincronización es por sondeo y renumerar 20 filas es más simple y no puede
  -- agotar la precisión de un número. Se elige lo simple.
  position       integer not null,
  status         text    not null default 'waiting'
                   check (status in ('waiting', 'singing', 'done', 'skipped', 'cancelled')),
  requested_at   text    not null default (datetime('now')),
  started_at     text,
  finished_at    text
);

-- Una sola canción sonando a la vez.
create unique index if not exists uq_queue_sonando
  on queue_items(session_id) where status = 'singing';
-- Posiciones únicas dentro de la sesión, ignorando lo ya cerrado.
create unique index if not exists uq_queue_posicion
  on queue_items(session_id, position)
  where status in ('waiting', 'singing');
-- Evita el duplicado accidental: la misma persona no pide la misma pista dos
-- veces mientras siga pendiente.
create unique index if not exists uq_queue_sin_duplicados
  on queue_items(session_id, participant_id, video_id)
  where status in ('waiting', 'singing');

create index if not exists ix_queue_pendientes
  on queue_items(session_id, status, position);
