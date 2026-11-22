-- DG-120 (DG-42): columns for live clan season leaderboard.
-- season_stats = per-owner contribution; clan_results = per-clan rollup shown on the board.

alter table season_stats add column if not exists tokens integer not null default 0;
alter table season_stats add column if not exists members integer not null default 0;
alter table season_stats add column if not exists clan_name text;

alter table clan_results add column if not exists tokens integer not null default 0;
alter table clan_results add column if not exists members integer not null default 0;
alter table clan_results add column if not exists clan_name text;

create index if not exists clan_results_season_score_idx
  on clan_results (season_id, wins desc, tokens desc);
