-- Fix: Allow admin to read ALL login logs, not just non-admin logs.
-- login_logs is optional and is not installed by the core backend schema.

do $$
begin
  if to_regclass('public.login_logs') is null then
    raise notice 'Skipping login_logs policy update because public.login_logs is not installed';
    return;
  end if;

  execute 'drop policy if exists "Allow admin to read non-admin login logs" on public.login_logs';
  execute $policy$
    create policy "Allow admin to read all login logs"
      on public.login_logs
      for select
      using (public.get_user_role(auth.uid()) = 'admin')
  $policy$;
end
$$;
