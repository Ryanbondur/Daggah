// server-only — Postgres when DATABASE_URL is set; in-memory PGlite for local/tests.
// PGlite and `pg` are loaded lazily so hosted API bundles do not evaluate WASM at import time
// (top-level PGlite import can crash the serverless function → FUNCTION_INVOCATION_FAILED).

import type { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
/** Hosted Cursor / Vercel apps should always get DATABASE_URL from cursor-app.json. */
const hosted = Boolean(process.env.VERCEL || process.env.CURSOR_APP_ID);

let pool: pg.Pool | undefined;
let local: Promise<PGlite> | undefined;
let schemaReady: Promise<void> | undefined;

export class DatabaseUnavailableError extends Error {
  readonly code = 'database_unavailable' as const;
  constructor(message = 'database_unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export function dbMode(): 'postgres' | 'pglite' {
  return databaseUrl !== '' ? 'postgres' : 'pglite';
}

export function isDatabaseUnavailable(error: unknown): boolean {
  return error instanceof DatabaseUnavailableError;
}

export function isUndefinedTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const msg = String((error as { message?: string }).message ?? error).toLowerCase();
  return msg.includes('does not exist') && msg.includes('relation');
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== '') {
    const p = await getPool();
    await ensurePostgresSchema(p);
    return (await p.query(text, params)).rows as T[];
  }
  if (hosted) {
    throw new DatabaseUnavailableError(
      'DATABASE_URL is not set on the hosted app; cloud auth/saves need Postgres',
    );
  }
  local ??= startLocal().catch((error: unknown) => {
    local = undefined;
    throw error;
  });
  return (await (await local).query<T>(text, params)).rows;
}

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;
  const mod = await import('pg');
  const Pg = mod.default;
  pool = new Pg.Pool({ connectionString: databaseUrl, max: 5 });
  return pool;
}

/**
 * Safety net when build-time migrate.mjs did not run (or migrations/ is absent from
 * the function bundle). DDL is idempotent (IF NOT EXISTS).
 */
async function ensurePostgresSchema(p: pg.Pool): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    // Prefer applying files from migrations/ when present (same as migrate.mjs).
    const appliedViaFiles = await tryApplyMigrationFiles(p);
    if (appliedViaFiles) return;
    await p.query(INLINE_SCHEMA_SQL);
  })().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

async function tryApplyMigrationFiles(p: pg.Pool): Promise<boolean> {
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const files = (await readdir('migrations').catch(() => []))
      .filter((f) => f.endsWith('.sql'))
      .sort();
    if (files.length === 0) return false;

    await p.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = new Set(
      (await p.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
    );
    for (const file of files.filter((f) => !done.has(f))) {
      const client = await p.connect();
      try {
        await client.query('begin');
        await client.query(await readFile(`migrations/${file}`, 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
        console.log(`db: applied ${file}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
    return true;
  } catch (error) {
    // Missing migrations/ in the serverless package is expected — fall back to inline DDL.
    console.warn(
      'db: migration files unavailable, using inline schema ensure',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/** Mirrors migrations/001 + 002 — used when the SQL files are not in the function bundle. */
const INLINE_SCHEMA_SQL = `
create table if not exists saves (
  owner_key text primary key,
  payload text not null,
  schema_version integer not null default 3,
  updated_at timestamptz not null default now()
);
create index if not exists saves_updated_at_idx on saves (updated_at desc);

create table if not exists season_stats (
  id bigserial primary key,
  season_id integer not null,
  owner_key text not null,
  clan_code text,
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists season_stats_season_owner_uidx
  on season_stats (season_id, owner_key);

create table if not exists clan_results (
  id bigserial primary key,
  season_id integer not null,
  clan_code text not null,
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists clan_results_season_clan_uidx
  on clan_results (season_id, clan_code);

create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_username_lower_uidx
  on users (lower(username));

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);
`;

async function startLocal(): Promise<PGlite> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readdir, readFile } = await import('node:fs/promises');
  const db = new PGlite();
  const files = (await readdir('migrations').catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, 'utf8'));
  }
  return db;
}

/** Test helper: drop the cached PGlite so the next sql() rebuilds from migrations. */
export function resetLocalDbForTests(): void {
  local = undefined;
  pool = undefined;
  schemaReady = undefined;
}
