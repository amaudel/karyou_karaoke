/**
 * YouTube IFrame API sustituye #yt-player con un elemento <iframe> real.
 *
 * IMPORTANTE: React no puede controlar las clases del DIV sustituido.
 * En su lugar, React mantiene un contenedor externo estable que NO modifica
 * YouTube. Cuando hay una puntuación, se oculta ESTE contenedor, y la
 * ceremonia se representa en un elemento hermano (no encima del iframe).
 */
import { createElement } from 'react';

/**
 * @param {{ oculto: boolean }} props
 * @returns {import('react').ReactElement}
 */
export function MarcoYouTube({ oculto }) {
  return createElement(
    'div',
    {
      'data-karyou-youtube-shell': '1',
      className: oculto ? 'hidden' : 'h-full w-full',
      'aria-hidden': oculto ? 'true' : 'false',
    },
    createElement('div', { id: 'yt-player', className: 'h-full w-full' }),
  );
}
