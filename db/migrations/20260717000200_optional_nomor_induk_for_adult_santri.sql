-- Adult santri may be recorded without a Qiroati registration number.
-- TPQ/child santri still require the official unique registration number.

alter table public.santri
  alter column nomor_induk_qiroati drop not null;

alter table public.santri
  drop constraint if exists santri_nomor_induk_required_for_non_adult;

alter table public.santri
  add constraint santri_nomor_induk_required_for_non_adult
  check (
    kategori = 'Dewasa'
    or nomor_induk_qiroati is not null
  );

comment on column public.santri.nomor_induk_qiroati is
  'Nomor resmi Qiroati; wajib dan unik untuk santri non-Dewasa, opsional untuk santri Dewasa.';
