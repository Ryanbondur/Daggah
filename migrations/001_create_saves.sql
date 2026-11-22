-- Cloud save blobs keyed by Cursor identity sub or hashed account code.
create table if not exists saves (
  owner_key text primary key,
  payload text not null,
  schema_version integer not null default 3,
  updated_at timestamptz not null default now()
);

create index if not exists saves_updated_at_idx on saves (updated_at desc);

-- DG-42 / DG-120: clan leaderboard / season standings (columns widened in 004).
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
