-- Cross-device clan halls (invite code → shared roster). Independent of season board tables.
-- Mirrored in api/_lib/db.ts INLINE_SCHEMA_STATEMENTS so first API hit creates tables
-- even if build-time migrate.mjs skipped (DATABASE_URL unset at build).
create table if not exists clan_halls (
  code text primary key,
  clan_id text not null,
  name text not null,
  payload text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists clan_halls_updated_at_idx on clan_halls (updated_at desc);
create unique index if not exists clan_halls_clan_id_uidx on clan_halls (clan_id);

-- One active seat per authenticated user (cross-device membership).
create table if not exists clan_hall_seats (
  user_id text primary key,
  clan_code text not null references clan_halls (code) on delete cascade,
  member_id text not null,
  updated_at timestamptz not null default now()
);

create index if not exists clan_hall_seats_clan_code_idx on clan_hall_seats (clan_code);
