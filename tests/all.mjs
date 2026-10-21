/**
 * Runner de pruebas.
 *
 * Se ejecuta en un solo proceso a propósito: `node --test tests/` lanza un proceso
 * hijo por archivo con stdio por tubería, y en entornos restringidos eso falla con
 * EPERM. Importar los archivos aquí evita el spawn y funciona igual.
 *
 * Nota: al compartir proceso, todos los archivos comparten la conexión de base de
 * datos. Si se añade un segundo archivo de pruebas que necesite otra base, habrá que
 * aislarlo también.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

if (files.length === 0) {
  console.error('No se encontraron archivos *.test.mjs');
  process.exit(1);
}

for (const file of files) {
  await import(new URL(`./${file}`, import.meta.url));
}
