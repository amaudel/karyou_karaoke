import assert from 'node:assert/strict';
import { chromium } from '/tmp/karyou-ui-test/node_modules/playwright/index.mjs';
import { crearSesion, unirseSesion } from '../src/db/sessions.mjs';

const { code } = await crearSesion('Guía de prueba', 'bar');
const participant = await unirseSesion(code, 'Cantante prueba', undefined, 'Mesa 1');
assert.equal(participant.ok, true);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addCookies([{ name: `p_${code}`, value: participant.token, url: 'http://localhost:3000' }]);
const page = await context.newPage();
const waitDialog = () => page.getByRole('dialog', { name: 'Guía de Karyou' });
async function probarTour(url, titulos, clave) {
  await page.goto(url);
  const dialog = waitDialog();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Muéstrame cómo' }).click();
  for (let i = 0; i < titulos.length; i++) {
    await dialog.getByRole('heading', { name: titulos[i], exact: true }).waitFor({ state: 'visible' });
    assert.equal(await dialog.getByText(`Paso ${i + 1} de 4`).count(), 1);
    const frame = await dialog.boundingBox();
    assert(frame && frame.width <= 390, 'El diálogo debe caber en el celular');
    if (i === 0) await page.screenshot({ path: `tour-${clave}.png` });
    if (i < 3) await dialog.getByRole('button', { name: 'Siguiente' }).click();
  }
  await dialog.getByRole('button', { name: '¡Entendido!' }).click();
  assert.equal(await dialog.count(), 0);
  await page.reload();
  await page.getByRole('button', { name: 'Cómo funciona' }).waitFor();
  assert.equal(await dialog.count(), 0, 'No se debe volver a mostrar automáticamente');
  await page.getByRole('button', { name: 'Cómo funciona' }).click();
  await dialog.getByRole('button', { name: 'Omitir' }).click();
  assert.equal(await dialog.count(), 0);
}
try {
 await probarTour(`http://localhost:3000/sala/${code}`, ['Busca tu canción','Pide la canción','Sigue tu turno','¡A cantar!'], 'participante');
 await probarTour(`http://localhost:3000/sala/${code}/control`, ['Abre la pantalla pública','Gestiona los turnos','Muestra tus promociones','Ajusta tu karaoke'], 'bar');
 console.log('Ambos recorridos completados, persistidos y reabiertos en pantalla móvil.');
} finally { await browser.close(); }
