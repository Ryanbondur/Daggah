// server-only — Postgres via DATABASE_URL using postgres.js (Edge/Node friendly).
// PGlite lives in ./dbPglite.ts (Vite/tests only). No node:fs / `pg` here — those crash
// some hosted runtimes at module load (FUNCTION_INVOCATION_FAILED).

import type postgres from 'postgres';

type SqlFn = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hosted = Boolean(process.env.VERCEL || process.env.CURSOR_APP_ID);

let client: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;
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
    const c = await getClient();
    await ensurePostgresSchema(c);
    const rows = await c.unsafe(text, params as never[]);
    return rows as unknown as T[];
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

async function getClient(): Promise<ReturnType<typeof postgres>> {
  if (client) return client;
  const { default: postgresFn } = await import('postgres');
  client = postgresFn(databaseUrl, {
    max: 5,
    // Transaction poolers (common on serverless) reject prepared statements.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 30,
  });
  return client;
}

/**
 * Idempotent DDL safety net when build-time migrate.mjs did not run
 * (common on hosted publish if DATABASE_URL was unset during `npm run build`).
 * Keeps 001–005 in sync: saves/board columns, users, rate_limits, clan halls.
 */
async function ensurePostgresSchema(c: ReturnType<typeof postgres>): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    for (const statement of INLINE_SCHEMA_STATEMENTS) {
      await c.unsafe(statement);
    }
  })().catch((error: unknown) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

/** Mirrors migrations/001 – 006 as individual statements (postgres.js-safe). */
const INLINE_SCHEMA_STATEMENTS = [
  `create table if not exists saves (
    owner_key text primary key,
    payload text not null,
    schema_version integer not null default 3,
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists saves_updated_at_idx on saves (updated_at desc)`,
  `create table if not exists season_stats (
    id bigserial primary key,
    season_id integer not null,
    owner_key text not null,
    clan_code text,
    clan_name text,
    wins integer not null default 0,
    losses integer not null default 0,
    tokens integer not null default 0,
    members integer not null default 0,
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists season_stats_season_owner_uidx
    on season_stats (season_id, owner_key)`,
  `create table if not exists clan_results (
    id bigserial primary key,
    season_id integer not null,
    clan_code text not null,
    clan_name text,
    wins integer not null default 0,
    losses integer not null default 0,
    tokens integer not null default 0,
    members integer not null default 0,
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists clan_results_season_clan_uidx
    on clan_results (season_id, clan_code)`,
  // DG-120: widen tables created by older migrate runs / prior INLINE creates.
  `alter table season_stats add column if not exists tokens integer not null default 0`,
  `alter table season_stats add column if not exists members integer not null default 0`,
  `alter table season_stats add column if not exists clan_name text`,
  `alter table clan_results add column if not exists tokens integer not null default 0`,
  `alter table clan_results add column if not exists members integer not null default 0`,
  `alter table clan_results add column if not exists clan_name text`,
  `create index if not exists clan_results_season_score_idx
    on clan_results (season_id, wins desc, tokens desc)`,
  `create table if not exists users (
    id text primary key,
    username text not null,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create unique index if not exists users_username_lower_uidx
    on users (lower(username))`,
  `create table if not exists sessions (
    token_hash text primary key,
    user_id text not null references users (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists sessions_user_id_idx on sessions (user_id)`,
  `create index if not exists sessions_expires_at_idx on sessions (expires_at)`,
  `create table if not exists rate_limits (
    key text primary key,
    count integer not null default 0,
    reset_at timestamptz not null
  )`,
  `create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at)`,
  `create table if not exists clan_halls (
    code text primary key,
    clan_id text not null,
    name text not null,
    payload text not null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  )`,
  `create index if not exists clan_halls_updated_at_idx on clan_halls (updated_at desc)`,
  `create unique index if not exists clan_halls_clan_id_uidx on clan_halls (clan_id)`,
  `create table if not exists clan_hall_seats (
    user_id text primary key,
    clan_code text not null references clan_halls (code) on delete cascade,
    member_id text not null,
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists clan_hall_seats_clan_code_idx on clan_hall_seats (clan_code)`,
  // DG-122: live 4v4 matchmaking queue + matches.
  `create table if not exists match_queue (
    id text primary key,
    user_id text not null,
    clan_code text not null,
    clan_name text not null,
    team_cp integer not null,
    avg_cp integer not null,
    bracket text not null,
    challenge_up boolean not null default false,
    at_top boolean not null default false,
    roster_json text not null,
    season_id integer not null default 1,
    created_at timestamptz not null default now()
  )`,
  `create unique index if not exists match_queue_user_uidx on match_queue (user_id)`,
  `create index if not exists match_queue_bracket_created_idx
    on match_queue (bracket, created_at)`,
  `create table if not exists matches (
    id text primary key,
    seed integer not null,
    bracket text not null,
    band_label text not null,
    team_a_user_id text not null,
    team_b_user_id text not null,
    team_a_clan_code text not null,
    team_b_clan_code text not null,
    team_a_clan_name text not null,
    team_b_clan_name text not null,
    team_a_roster text not null,
    team_b_roster text not null,
    team_a_team_cp integer not null,
    team_b_team_cp integer not null,
    status text not null default 'ready',
    created_at timestamptz not null default now()
  )`,
  `create index if not exists matches_team_a_user_idx on matches (team_a_user_id, created_at desc)`,
  `create index if not exists matches_team_b_user_idx on matches (team_b_user_id, created_at desc)`,
  `create index if not exists matches_status_created_idx on matches (status, created_at desc)`,
  `create table if not exists match_reports (
    match_id text not null references matches (id) on delete cascade,
    user_id text not null,
    won boolean not null,
    season_id integer not null default 1,
    clan_code text,
    clan_name text,
    tokens integer not null default 0,
    members integer not null default 0,
    created_at timestamptz not null default now(),
    primary key (match_id, user_id)
  )`,
  `create index if not exists match_reports_season_idx on match_reports (season_id, created_at desc)`,
];

/** Test helper: drop cached client / local registration so the next sql() rebuilds. */
export function resetLocalDbForTests(): void {
  if (client) {
    void client.end({ timeout: 1 }).catch(() => undefined);
  }
  client = undefined;
  schemaReady = undefined;
  localSql = undefined;
}
