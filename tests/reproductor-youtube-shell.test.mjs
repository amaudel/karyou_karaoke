import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { MarcoYouTube } from '../src/components/MarcoYouTube.mjs';

/**
 * Regresión real del problema reportado:
 * YouTube REEMPLAZA el DIV que recibe YT.Player por un iframe, así que
 * no se puede alternar su propia clase con React. El wrapper externo debe
 * ser el que se oculte (y el resultado, un hermano de ese wrapper).
 */
test('la TV tiene un envoltorio React ESTABLE alrededor de #yt-player', () => {
  const visible = renderToStaticMarkup(createElement(MarcoYouTube, { oculto: false }));
  const oculto = renderToStaticMarkup(createElement(MarcoYouTube, { oculto: true }));

  assert.match(visible, /data-karyou-youtube-shell="1"/);
  assert.match(visible, /class="h-full w-full"/);
  assert.match(oculto, /data-karyou-youtube-shell="1" class="hidden"/);

  const placeholder = /<div id="yt-player" class="h-full w-full"><\/div>/;
  assert.match(visible, placeholder);
  assert.match(oculto, placeholder, 'el reproductor sobrevive montado mientras se revela el resultado');

  // Recrea la sustitución que hace YouTube: el DIV desaparece, pero el
  // contenedor controlado por React todavía tiene la clase hidden.
  const youtubeSustituyoNodo = oculto.replace(placeholder, '<iframe id="yt-player" src="https://www.youtube.com/embed/test"></iframe>');
  assert.match(youtubeSustituyoNodo, /data-karyou-youtube-shell="1" class="hidden"[^>]*><iframe/);
  assert.doesNotMatch(youtubeSustituyoNodo, /<div id="yt-player"/);
});

test('el escenario no intenta ocultar un nodo que YouTube sustituye', () => {
  const fuente = readFileSync('src/components/KaraokeStage.tsx', 'utf8');
  assert.match(fuente, /<MarcoYouTube oculto=\{Boolean\(reemplazo\)\}/);
  assert.match(fuente, /<MarcoYouTube[^>]*\/>\s*\{reemplazo\}/);
  assert.doesNotMatch(fuente, /id=\{ID_REPRODUCTOR\}[\s\S]{0,80}className=\{reemplazo/);
});

test('el criterio de mostrar nota no depende de si la cola tiene otras canciones', async () => {
  const { debeRevelarResultado } = await import('../src/domain/tv/revelacion-resultado.mjs');
  const nuevo = { id: 204, queue_item_id: 86 };
  assert.equal(debeRevelarResultado({
    resultado: nuevo, reciente: true, ultimoMostradoId: 203,
    turnoSonandoId: null,
  }), true);
});
