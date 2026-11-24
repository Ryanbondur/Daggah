-- DG-120 (DG-42): columns for live clan season leaderboard (board API + cloud save upsert).
-- Depends on 001_create_saves.sql (season_stats / clan_results base tables).
-- season_stats = per-owner contribution; clan_results = per-clan rollup shown on the board.
-- Mirrored in api/_lib/db.ts INLINE_SCHEMA_STATEMENTS for hosted publish safety.

alter table season_stats add column if not exists tokens integer not null default 0;
alter table season_stats add column if not exists members integer not null default 0;
alter table season_stats add column if not exists clan_name text;

alter table clan_results add column if not exists tokens integer not null default 0;
alter table clan_results add column if not exists members integer not null default 0;
alter table clan_results add column if not exists clan_name text;

create index if not exists clan_results_season_score_idx
  on clan_results (season_id, wins desc, tokens desc);
