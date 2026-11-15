/**
 * Local / test PGlite backend. Import this from Vite middleware or vitest only —
 * never from api/* (keeps WASM out of the hosted function bundle).
 */
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { registerLocalSql, resetLocalDbForTests } from './db';

let local: Promise<PGlite> | undefined;

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir('migrations').catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, 'utf8'));
  }
  return db;
}

registerLocalSql(async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
  local ??= startLocal().catch((error: unknown) => {
    local = undefined;
    throw error;
  });
  return (await (await local).query<T>(text, params)).rows;
});

/** Clears PGlite instance; tests should also call resetLocalDbForTests() then re-import/register. */
export function resetPgliteForTests(): void {
  local = undefined;
  resetLocalDbForTests();
  // Re-register after reset cleared localSql.
  registerLocalSql(async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
    local ??= startLocal().catch((error: unknown) => {
      local = undefined;
      throw error;
    });
    return (await (await local).query<T>(text, params)).rows;
  });
}
