-- 006_genero.sql — género musical, para poder buscar por género
--
-- La búsqueda compara texto contra artista + título, así que buscar «vallenato»
-- solo encontraba las 11 canciones que llevan esa palabra en el nombre, de las
-- 1.161 de vallenato que hay en el pool. El género es un dato aparte que sí se
-- puede consultar, y sirve igual para bachata, salsa, rancheras o cumbia.
--
-- Se rellena con `pnpm clasificar:genero` (ver src/domain/genero.mjs). Nace nulo a
-- propósito: no se inventa un género para lo que no se puede clasificar.

alter table pool_items add column genre text;

create index if not exists ix_pool_genre on pool_items(genre);
