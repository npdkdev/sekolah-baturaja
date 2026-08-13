-- Purpose: install privacy-conscious login activity logging for the admin dashboard.
-- Safety: credentials and tokens are never accepted or stored; direct table inserts stay revoked.

create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  role text,
  username_attempt text,
  status text not null,
  ip_address text,
  city text,
  country text,
  device text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint login_logs_status_check check (status in ('success', 'failed')),
  constraint login_logs_role_check check (role is null or role in ('admin', 'guru', 'santri', 'pentashih'))
);

create index if not exists login_logs_created_at_idx on public.login_logs(created_at desc);
create index if not exists login_logs_status_idx on public.login_logs(status);

alter table public.login_logs enable row level security;
revoke all on table public.login_logs from anon, authenticated;
grant select, delete on table public.login_logs to authenticated;

drop policy if exists "Allow admin to read non-admin login logs" on public.login_logs;
drop policy if exists "Allow admin to read all login logs" on public.login_logs;
drop policy if exists "Allow admin to delete login logs" on public.login_logs;
drop policy if exists "login_logs_admin_select" on public.login_logs;
drop policy if exists "login_logs_admin_delete" on public.login_logs;

create policy "login_logs_admin_select"
  on public.login_logs
  for select
  to authenticated
  using (public.is_admin());

create policy "login_logs_admin_delete"
  on public.login_logs
  for delete
  to authenticated
  using (public.is_admin());

create or replace function public.record_login_attempt(
  p_username_attempt text,
  p_status text,
  p_role text default null,
  p_device text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_ip_hash text;
  v_alias_hash text;
  v_allowed boolean := false;
  v_role text := null;
begin
  if p_username_attempt is null or length(btrim(p_username_attempt)) = 0 then
    raise exception 'username is required';
  end if;

  if p_status not in ('success', 'failed') then
    raise exception 'invalid login status';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := coalesce(
    nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''),
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    'unknown'
  );
  v_ip_hash := encode(extensions.digest(v_ip, 'sha256'), 'hex');
  v_alias_hash := encode(extensions.digest(lower(btrim(p_username_attempt)), 'sha256'), 'hex');

  select rate_limit.allowed
  into v_allowed
  from public.consume_auth_rate_limit(
    'login-log',
    v_ip_hash,
    v_alias_hash,
    20,
    300,
    900
  ) rate_limit;

  if not coalesce(v_allowed, false) then
    return false;
  end if;

  if auth.uid() is not null then
    v_role := public.current_user_role()::text;
  elsif p_role in ('admin', 'guru', 'santri', 'pentashih') then
    v_role := p_role;
  end if;

  insert into public.login_logs (
    user_id,
    role,
    username_attempt,
    status,
    device
  ) values (
    case when p_status = 'success' then auth.uid() else null end,
    v_role,
    left(btrim(p_username_attempt), 160),
    p_status,
    case when p_device in ('Desktop', 'Tablet', 'Mobile') then p_device else 'Unknown' end
  );

  return true;
end;
$$;

revoke all on function public.record_login_attempt(text, text, text, text) from public;
grant execute on function public.record_login_attempt(text, text, text, text) to anon, authenticated;

comment on function public.record_login_attempt(text, text, text, text)
  is 'Records a rate-limited login result without accepting passwords, tokens, or raw user-agent data.';
