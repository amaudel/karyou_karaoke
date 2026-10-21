import { DatabaseSync } from 'node:sqlite';
import { searchPool } from '../src/db/queries.mjs';

const db = new DatabaseSync('data/karaoke.db');
const n = (sql) => db.prepare(sql).get().n;

console.log('=== Pool ===');
console.log('  filas totales:      ', n('select count(*) as n from pool_items'));
console.log('  embebibles:         ', n('select count(*) as n from pool_items where embeddable = 1'));
console.log('  no embebibles:      ', n('select count(*) as n from pool_items where embeddable = 0'));
console.log('  con duración:       ', n('select count(*) as n from pool_items where duration_seconds is not null'));
console.log(
  '  usables en búsqueda:',
  n("select count(*) as n from pool_items p join channels c on c.id=p.channel_id where c.excluded=0 and p.embeddable=1 and p.karaoke_match <> 'none'"),
);

console.log('\n=== Artistas más frecuentes ===');
for (const r of db
  .prepare(
    `select artist, count(*) as n from pool_items
      where embeddable = 1 and karaoke_match <> 'none' and artist <> ''
      group by artist order by n desc limit 10`,
  )
  .all()) {
  console.log(`  ${String(r.n).padStart(5)}  ${r.artist}`);
}

console.log('\n=== Duración ===');
const d = db
  .prepare(
    `select
       sum(case when duration_seconds < 120 then 1 else 0 end) as cortas,
       sum(case when duration_seconds between 120 and 480 then 1 else 0 end) as normales,
       sum(case when duration_seconds > 480 then 1 else 0 end) as largas
     from pool_items where duration_seconds is not null`,
  )
  .get();
console.log(`  <2min: ${d.cortas}   2-8min: ${d.normales}   >8min: ${d.largas}`);

// Cuántas canciones tienen más de un video reproducible. Importa porque YouTube
// puede bloquear la inserción de un video concreto por un reclamo de derechos
// aunque la API diga embeddable = true, y la única salida es probar otra versión.
console.log('\n=== Versiones alternativas por canción ===');
const rep = db
  .prepare(
    `select
       count(*)                                              as canciones,
       sum(case when n > 1 then 1 else 0 end)                as con_varias,
       max(n)                                                as maximo
     from (
       select artist_norm, title_norm, count(*) as n
         from pool_items
        where embeddable = 1 and karaoke_match <> 'none'
          and artist_norm <> '' and title_norm <> ''
        group by artist_norm, title_norm
     )`,
  )
  .get();
const pct = rep.canciones > 0 ? ((rep.con_varias / rep.canciones) * 100).toFixed(1) : '0';
console.log(`  canciones distintas en el pool: ${rep.canciones}`);
console.log(`  con más de una versión:         ${rep.con_varias} (${pct}%)`);
console.log(`  máximo de versiones de una:     ${rep.maximo}`);

console.log('\n  Las 5 con más versiones:');
for (const r of db
  .prepare(
    `select artist, song_title, count(*) as n
       from pool_items
      where embeddable = 1 and karaoke_match <> 'none'
      group by artist_norm, title_norm
      having n > 1
      order by n desc limit 5`,
  )
  .all()) {
  console.log(`    ${String(r.n).padStart(3)}  ${r.artist} — ${r.song_title}`);
}

db.close();

console.log('\n=== Tiempo de búsqueda (10 repeticiones cada una) ===');
const consultas = ['shakira', 'mana', 'selena', 'como la flor', 'juan gabriel', 'ranchera', 'daddy yankee'];
for (const q of consultas) {
  await searchPool(q); // calentar
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) await searchPool(q);
  const ms = (performance.now() - t0) / 10;
  const hits = await searchPool(q);
  console.log(`  ${q.padEnd(14)} ${ms.toFixed(1).padStart(6)} ms   ${String(hits.length).padStart(3)} resultados   ej: ${hits[0]?.song_title ?? '—'}`);
}

console.log('\n=== Recuento por artista en la búsqueda ===');
for (const q of ['shakira', 'selena', 'mana', 'vicente fernandez']) {
  console.log(`  "${q}" -> ${(await searchPool(q)).length} resultados`);
}
