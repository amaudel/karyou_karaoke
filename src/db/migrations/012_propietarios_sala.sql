-- La capacidad de borrar una sala corresponde a quien la creó.
-- Se guarda solo la huella del token, nunca el secreto en texto plano.
-- Sin token no se puede reclamar una sala antigua por conocer su código.
create table if not exists session_owners (
  session_id integer primary key references sessions(id) on delete cascade,
  token_hash text not null check(length(token_hash) = 64)
);
