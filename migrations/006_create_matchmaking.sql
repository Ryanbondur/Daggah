-- Live 4v4 matchmaking queue + formed matches (DG-122).
create table if not exists match_queue (
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
);

create unique index if not exists match_queue_user_uidx on match_queue (user_id);
create index if not exists match_queue_bracket_created_idx
  on match_queue (bracket, created_at);

create table if not exists matches (
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
);

create index if not exists matches_team_a_user_idx on matches (team_a_user_id, created_at desc);
create index if not exists matches_team_b_user_idx on matches (team_b_user_id, created_at desc);
create index if not exists matches_status_created_idx on matches (status, created_at desc);

create table if not exists match_reports (
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
);

create index if not exists match_reports_season_idx on match_reports (season_id, created_at desc);
