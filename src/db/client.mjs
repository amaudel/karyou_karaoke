import { instrumentarPrepare } from './sql-metrics.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Capa de acceso a datos. Dos motores, una misma interfaz asíncrona:
 *
 *   - Local (`node:sqlite`): para desarrollo y tests. Síncrono por debajo, pero
 *     aquí se expone asíncrono para que el código de arriba no distinga.
 *   - Turso (`@libsql/client`): para producción en Vercel. Asíncrono de verdad.
 *
 * La interfaz es deliberadamente estrecha y uniforme:
 *
 *   const db = await getDb();
 *   await db.prepare(sql).get(...) / .all(...) / .run(...)
 *   await db.transaction(async (tx) => { ... })   // atómico
 *
 * Antes, el camino Turso lanzaba un proceso hijo por consulta (`execFileSync` →
 * `scripts/turso-query.mjs`). Eso funcionaba en Vercel, pero era lento y, sobre
 * todo, hacía que `BEGIN`/`COMMIT` fueran entre conexiones distintas: no eran
 * transacciones. Aquí las transacciones son reales en ambos motores.
 */

/** @type {any} */
let dbLocal = null;
/** @type {import('@libsql/client').Client | null} */
let dbTurso = null;
/**
 * Cola para serializar transacciones sobre `dbLocal`.
 *
 * Aunque `node:sqlite` es síncrono, el callback de `transaction(async (tx) => ...)`
 * cede el control en cada `await`. Si dos peticiones llegan a la vez, la segunda
 * podría ejecutar `BEGIN` antes de que la primera haga `COMMIT` sobre la misma
 * conexión. Encolarlas garantiza que corran de una en una sin chocar.
 */
let colaTxLocal = Promise.resolve();

/** Cola de escrituras de `dbTurso` cuando la URL es un archivo local. */
let colaEscrituraTurso = Promise.resolve();

/** @param {string | undefined} url */
function esArchivoLocal(url) {
  return String(url ?? '').startsWith('file:');
}

/** @param {string} sql */
function escribe(sql) {
  return /^\s*(insert|update|delete|replace|create|drop|alter)\b/i.test(sql);
}

/**
 * @template T
 * @param {() => Promise<T>} tarea
 * @returns {Promise<T>}
 */
function encolarEscritura(tarea) {
  const siguiente = colaEscrituraTurso.then(tarea, tarea);
  colaEscrituraTurso = siguiente.then(
    () => undefined,
    () => undefined,
  );
  return siguiente;
}

/**
 * Transacción real sobre `@libsql/client`.
 * @template T
 * @param {import('@libsql/client').Client} cliente
 * @param {(tx: any) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function transaccionTurso(cliente, fn) {
  // OJO: `@libsql/client` NO acepta la forma `transaction(fn)`. Su firma es
  // `transaction(mode?): Promise<Transaction>`, así que pasarle el callback lo
  // interpreta como el MODO y el callback nunca se ejecuta: las escrituras se
  // pierden en silencio. Hay que abrir la transacción, ejecutar y confirmar.
  const tx = await cliente.transaction('write');
  try {
    const prepararTx = instrumentarPrepare(prepareTurso((sql, args) => tx.execute({ sql, args: args ?? [] })));
    const resultado = await fn({ prepare: prepararTx });
    await tx.commit();
    return resultado;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Si ya estaba cerrada, no hay nada que revertir.
    }
    throw error;
  } finally {
    try {
      tx.close();
    } catch {
      // Ya cerrada por commit o rollback.
    }
  }
}

export function rutaBase() {
  return process.env.KARAOKE_DB ?? path.join(process.cwd(), 'data', 'karaoke.db');
}

function usarTurso() {
  return Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

/**
 * `prepare` de Turso: traduce `prepare().get/all/run` a `execute({ sql, args })`.
 * @param {(sql: string, args: any[]) => Promise<any>} ejecutar
 */
function prepareTurso(ejecutar) {
  return (sql) => ({
    async get(...args) {
      const res = await ejecutar(sql, args);
      return res?.rows?.[0];
    },
    async all(...args) {
      const res = await ejecutar(sql, args);
      return res?.rows ?? [];
    },
    async run(...args) {
      const res = await ejecutar(sql, args);
      return {
        changes: res?.rowsAffected ?? 0,
        lastInsertRowid: Number(res?.lastInsertRowid ?? 0),
      };
    },
  });
}

/** `prepare` de node:sqlite: los métodos ya son síncronos; se envuelven en async. */
function prepareLocal(db) {
  return (sql) => {
    const stmt = db.prepare(sql);
    return {
      async get(...args) {
        return stmt.get(...args);
      },
      async all(...args) {
        return stmt.all(...args);
      },
      async run(...args) {
        return stmt.run(...args);
      },
    };
  };
}

/**
 * @returns {Promise<{
 *   prepare: (sql: string) => {
 *     get: (...args: any[]) => Promise<any>;
 *     all: (...args: any[]) => Promise<any[]>;
 *     run: (...args: any[]) => Promise<{ changes: number, lastInsertRowid: number }>;
 *   };
 *   transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
 *   close: () => Promise<void>;
 * }>}
 */
export async function getDb() {
  if (usarTurso()) {
    if (!dbTurso) {
      dbTurso = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    }

    // En modo `file:` (pruebas) cada transacción abre otra conexión y SQLite no espera
    // a la que tiene el candado: una escritura suelta que coincide con una transacción
    // falla con SQLITE_BUSY y deja el cliente inservible. Con Turso remoto el servidor
    // ya serializa las escrituras, así que ahí no se encola nada (una cola aquí
    // frenaría ráfagas como los aplausos).
    const serializar = esArchivoLocal(process.env.TURSO_DATABASE_URL);

    const prepare = instrumentarPrepare(prepareTurso((sql, args) => {
      const ejecutar = () => dbTurso.execute({ sql, args: args ?? [] });
      return serializar && escribe(sql) ? encolarEscritura(ejecutar) : ejecutar();
    }));

    return {
      prepare,
      async transaction(fn) {
        const cliente = dbTurso;
        return serializar
          ? encolarEscritura(() => transaccionTurso(cliente, fn))
          : transaccionTurso(cliente, fn);
      },
      async close() {
        dbTurso?.close();
        dbTurso = null;
      },
    };
  }

  // ------------------------------------------------------------------ local
  if (!dbLocal) {
    const ruta = rutaBase();
    if (!fs.existsSync(ruta)) {
      throw new Error(`No existe la base de datos en ${ruta}.\nEjecuta primero:  pnpm db:setup`);
    }
    dbLocal = new DatabaseSync(ruta);
    dbLocal.exec('pragma foreign_keys = on');
  }

  const prepare = instrumentarPrepare(prepareLocal(dbLocal));

  return {
    prepare,
    async transaction(fn) {
      const ejecutar = async () => {
        dbLocal.exec('begin');
        try {
          const resultado = await fn({ prepare });
          dbLocal.exec('commit');
          return resultado;
        } catch (error) {
          dbLocal.exec('rollback');
          throw error;
        }
      };

      const siguiente = colaTxLocal.then(ejecutar, ejecutar);
      colaTxLocal = siguiente.then(
        () => undefined,
        () => undefined,
      );
      return siguiente;
    },
    async close() {
      try {
        dbLocal?.close();
      } catch {
        // Ya estaba cerrada.
      }
      dbLocal = null;
    },
  };
}

export function plano(fila) {
  return fila ? { ...fila } : fila;
}

export function planas(filas) {
  return filas.map((f) => ({ ...f }));
}

export async function closeDb() {
  if (dbLocal) {
    try {
      dbLocal.close();
    } catch {
      // Ya estaba cerrada.
    }
    dbLocal = null;
  }
  if (dbTurso) {
    dbTurso.close();
    dbTurso = null;
  }
}
