-- 005_puntuaciones.sql — resultados y aplausos de la audiencia
--
-- El motor de puntuación es lógica pura (src/domain/scoring) y no sabe nada de
-- bases de datos. Aquí solo se guarda lo que produce, más el desglose de por qué
-- salió ese número.

create table if not exists scores (
  id             integer primary key,
  session_id     integer not null references sessions(id) on delete cascade,
  participant_id integer not null references participants(id) on delete cascade,
  -- Un turno produce una puntuación y solo una. Es el invariante que hace
  -- idempotente el cierre: si `ended` llega dos veces, o la TV reintenta, el
  -- índice único lo rechaza en vez de duplicar el resultado.
  queue_item_id  integer not null unique references queue_items(id) on delete cascade,
  video_id       text    not null,

  total          integer not null check (total between 0 and 100),
  rhythm         integer not null check (rhythm between 0 and 100),
  energy         integer not null check (energy between 0 and 100),
  interpretation integer not null check (interpretation between 0 and 100),
  tier           text    not null
                   check (tier in ('under', 'normal', 'good', 'excellent', 'exceptional')),

  -- Con qué reglas se calculó. Sin esto no se puede saber si una nota guardada
  -- salió del motor actual o de uno anterior, ni recalcularla al cambiar pesos.
  engine_version integer not null,
  seed           text    not null,
  -- Señales usadas y aporte de cada componente, en JSON. Permite auditar
  -- cualquier resultado que alguien reclame.
  inputs         text    not null,
  detail         text    not null,

  created_at     text    not null default (datetime('now'))
);

create index if not exists ix_scores_sesion on scores(session_id, total desc);
create index if not exists ix_scores_participante on scores(participant_id, created_at desc);

-- Aplausos de la audiencia.
--
-- Es la única señal de la puntuación que viene de personas de verdad, y la única
-- forma barata de tenerla: la audiencia ya está en la aplicación, con el móvil en
-- la mano. Sin esto, la puntuación sería casi todo azar — está medido en el
-- calibrador.
create table if not exists cheers (
  id             integer primary key,
  session_id     integer not null references sessions(id) on delete cascade,
  queue_item_id  integer not null references queue_items(id) on delete cascade,
  -- Quién aplaude.
  participant_id integer not null references participants(id) on delete cascade,
  created_at     text    not null default (datetime('now'))
);

-- Un aplauso por persona y canción.
--
-- Se lee como «5 personas te aplaudieron», que es un dato honesto y no se puede
-- inflar. Con aplausos libres, uno solo con ganas podría distorsionar la nota.
create unique index if not exists uq_cheers_persona
  on cheers(queue_item_id, participant_id);
create index if not exists ix_cheers_turno on cheers(queue_item_id);
