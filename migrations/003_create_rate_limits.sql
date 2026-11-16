create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

create index if not exists rate_limits_reset_at_idx on rate_limits (reset_at);
