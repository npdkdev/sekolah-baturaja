-- Purpose: allow teachers to resolve active WhatsApp group links while keeping writes admin-only.
-- Safety: read-only permission expansion for authenticated guru accounts.

drop policy if exists "whatsapp_group_links_admin_select" on public.whatsapp_group_links;

create policy "whatsapp_group_links_staff_select"
  on public.whatsapp_group_links for select to authenticated
  using (public.is_admin() or public.is_guru());
