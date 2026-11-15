-- Username/password accounts + sessions (DG-58). Saves stay in `saves` keyed by owner_key.
-- Username owners use owner_key = 'user:<user_id>'. Account-code and Cursor-identity keys remain valid.

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
