-- Purpose: allow trusted backend migration tooling to populate late-added tables.
-- Safety: service_role only; browser roles remain governed by existing grants and RLS.

grant all on table public.jilid_history to service_role;
grant all on table public.whatsapp_group_links to service_role;
