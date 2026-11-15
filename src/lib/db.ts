// server-only — Postgres via DATABASE_URL (hosted + local with a URL).
// PGlite lives in ./dbPglite.ts and is registered only by Vite/tests — never import
// @electric-sql/pglite from this module (WASM in the API bundle → FUNCTION_INVOCATION_FAILED).

type SqlFn = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  connect: () => Promise<{
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
};

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
/** Hosted Cursor / Vercel apps should always get DATABASE_URL from cursor-app.json. */
const hosted = Boolean(process.env.VERCEL || process.env.CURSOR_APP_ID);

let pool: PgPool | undefined;
let schemaReady: Promise<void> | undefined;
/** Injected by dbPglite.ts for local dev / vitest when DATABASE_URL is unset. */
let localSql: SqlFn | undefined;

export class DatabaseUnavailableError extends Error {
  readonly code = 'database_unavailable' as const;
  constructor(message = 'database_unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export function dbMode(): 'postgres' | 'pglite' | 'none' {
  if (databaseUrl !== '') return 'postgres';
  if (localSql) return 'pglite';
  return 'none';
}

/** Used by src/lib/dbPglite.ts — do not call from API routes. */
export function registerLocalSql(fn: SqlFn): void {
  localSql = fn;
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
  if (localSql) {
    return localSql<T>(text, params);
  }
  if (hosted) {
    throw new DatabaseUnavailableError(
      'DATABASE_URL is not set on the hosted app; cloud auth/saves need Postgres',
    );
  }
  throw new DatabaseUnavailableError(
    'No database: set DATABASE_URL or load src/lib/dbPglite.ts for local PGlite',
  );
}

async function getPool(): Promise<PgPool> {
  if (pool) return pool;
  // Dynamic import — avoid a static `pg` edge into the module graph where possible.
  const mod = await import('pg');
  const Pool = mod.default.Pool as unknown as new (opts: {
    connectionString: string;
    max: number;
  }) => PgPool;
  pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return pool;
}

/**
 * Safety net when build-time migrate.mjs did not run (or migrations/ is absent from
 * the function bundle). DDL is idempotent (IF NOT EXISTS).
 */
async function ensurePostgresSchema(p: PgPool): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const appliedViaFiles = await tryApplyMigrationFiles(p);
    if (appliedViaFiles) return;
    await p.query(INLINE_SCHEMA_SQL);
  })().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

async function tryApplyMigrationFiles(p: PgPool): Promise<boolean> {
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
    const migrated = await p.query('select name from schema_migrations');
    const done = new Set(
      (migrated.rows as { name: string }[]).map((r) => r.name),
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

/** Test helper: drop cached pool / local registration so the next sql() rebuilds. */
export function resetLocalDbForTests(): void {
  pool = undefined;
  schemaReady = undefined;
  localSql = undefined;
}
