-- Add optional details for the existing expenses workflow.
-- The existing expenses table and RLS policies remain the single source of truth.
alter table if exists public.expenses
  add column if not exists metode_pembayaran text,
  add column if not exists catatan text;
