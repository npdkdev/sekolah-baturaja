-- Durable rate-limit counters for authentication.
--
-- The Go backend previously counted login attempts in a per-process map. That
-- has two holes: the counters reset on every restart or redeploy (so an
-- attacker just waits for one), and they are not shared, so any horizontal
-- scaling multiplies the effective limit by the instance count.
--
-- Postgres is already the single source of truth for this deployment, so the
-- window lives here.
--
-- Deliberately NOT named auth_rate_limits: that table already exists from
-- 20260624000300 with an entirely different shape (purpose/ip_hash/alias_hash/
-- attempts), so a `create table if not exists` silently became a no-op and left
-- the functions referencing columns that do not exist. The Supabase-era
-- consume_auth_rate_limit RPC is left alone; this is a separate mechanism with
-- a separate name.

create table if not exists public.auth_throttle (
  bucket       text        not null,
  key          text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (bucket, key),
  constraint auth_throttle_count_non_negative check (count >= 0)
);

comment on table public.auth_throttle is
  'Fixed-window counters for login/feedback throttling. Rows are disposable; safe to truncate.';

-- Lets the sweeper find expired windows without a full scan.
create index if not exists auth_throttle_window_start_idx
  on public.auth_throttle (window_start);

-- consume_auth_throttle records one hit and reports whether it is allowed.
--
-- The INSERT ... ON CONFLICT DO UPDATE is a single atomic statement, so
-- concurrent requests for the same key cannot both read a stale count and both
-- decide they are under the limit. The returned count is the post-increment
-- value; the caller compares it against p_max.
create or replace function public.consume_auth_throttle(
  p_bucket text,
  p_key    text,
  p_max    integer,
  p_window interval
)
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.auth_throttle as rl (bucket, key, window_start, count)
  values (p_bucket, p_key, now(), 1)
  on conflict (bucket, key) do update
    -- Expired window: start a fresh one. Otherwise increment in place.
    set window_start = case
          when rl.window_start < now() - p_window then now()
          else rl.window_start
        end,
        count = case
          when rl.window_start < now() - p_window then 1
          else rl.count + 1
        end
  returning rl.count into v_count;

  return v_count <= p_max;
end;
$$;

-- reset_auth_throttle clears a key after a successful login so a user who
-- mistyped their password a few times is not left throttled.
create or replace function public.reset_auth_throttle(
  p_bucket text,
  p_key    text
)
returns void
language sql
as $$
  delete from public.auth_throttle
  where bucket = p_bucket and key = p_key;
$$;
