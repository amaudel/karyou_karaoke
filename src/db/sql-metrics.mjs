import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

// Aislamiento por petición asíncrona: nunca compartir contadores entre salas.
const contexto = new AsyncLocalStorage();
const PERCENTILES = [0.5, 0.95];

export function resumenSql(muestra) {
  const tiempos = [...muestra.tiempos].sort((a, b) => a - b);
  const percentil = (p) => tiempos.length ? tiempos[Math.ceil(tiempos.length * p) - 1] : 0;
  return {
    ruta: muestra.ruta,
    motor: muestra.motor,
    consultas: muestra.consultas,
    errores: muestra.errores,
    sqlMs: Number(muestra.sqlMs.toFixed(3)),
    p50SqlMs: Number(percentil(PERCENTILES[0]).toFixed(3)),
    p95SqlMs: Number(percentil(PERCENTILES[1]).toFixed(3)),
    renderMs: Number((performance.now() - muestra.inicio).toFixed(3)),
  };
}

/** No registra SQL, argumentos, códigos de sala, tokens ni datos de usuarios. */
export async function medirRutaSql(ruta, fn, { registrar = console.info, motor = 'desconocido' } = {}) {
  if (process.env.KARYOU_SQL_METRICS !== '1') return fn();
  const muestra = { ruta, motor, consultas: 0, errores: 0, sqlMs: 0, tiempos: [], inicio: performance.now() };
  return contexto.run(muestra, async () => {
    try { return await fn(); }
    finally { registrar(JSON.stringify({ evento: 'karyou_sql_metrics', ...resumenSql(muestra) })); }
  });
}

/** Envuelve solo la ejecución, no prepare(): cuenta SQL real y también fallos. */
export function instrumentarPrepare(preparar) {
  return (sql) => {
    const sentencia = preparar(sql);
    return Object.fromEntries(['get', 'all', 'run'].map((metodo) => [metodo, async (...args) => {
      const muestra = contexto.getStore();
      if (!muestra) return sentencia[metodo](...args);
      const inicio = performance.now();
      muestra.consultas += 1;
      try { return await sentencia[metodo](...args); }
      catch (error) { muestra.errores += 1; throw error; }
      finally {
        const ms = performance.now() - inicio;
        muestra.sqlMs += ms;
        muestra.tiempos.push(ms);
      }
    }]));
  };
}
