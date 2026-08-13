-- Logical migration: 0007_payments_expenses_and_payment_status
-- Purpose: create financial tables and a status-only payment view for teachers.
-- Dependencies: 20260624000400_classes_memberships_and_mutations.sql.
-- Safety: no credentials, no seed data; guru must not read payment details.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  bulan integer check (bulan between 1 and 12),
  tahun integer check (tahun between 2000 and 2100),
  jumlah numeric(12,2) not null check (jumlah >= 0),
  tanggal_pembayaran date not null,
  metode_pembayaran text,
  status text not null default 'paid',
  catatan text,
  transaction_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint payments_status_check check (status in ('paid', 'unpaid', 'void', 'refunded'))
);

create unique index if not exists payments_transaction_id_unique
  on public.payments(transaction_id)
  where transaction_id is not null;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tanggal_pengeluaran date not null,
  kategori text,
  deskripsi text,
  jumlah numeric(12,2) not null check (jumlah >= 0),
  bukti_url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create or replace view public.payment_status_summary as
select
  s.id as santri_id,
  cm.class_id,
  p.bulan,
  p.tahun,
  case
    when exists (
      select 1
      from public.payments p2
      where p2.santri_id = s.id
        and p2.bulan is not distinct from p.bulan
        and p2.tahun is not distinct from p.tahun
        and p2.status = 'paid'
        and p2.deleted_at is null
    ) then 'Lunas'::public.payment_visibility_status
    else 'Belum Lunas'::public.payment_visibility_status
  end as status
from public.santri s
join public.class_memberships cm on cm.santri_id = s.id and cm.status = 'active'
left join public.payments p on p.santri_id = s.id and p.deleted_at is null
group by s.id, cm.class_id, p.bulan, p.tahun;

create index if not exists payments_santri_id_idx on public.payments(santri_id);
create index if not exists payments_year_month_idx on public.payments(tahun, bulan);
create index if not exists payments_tanggal_idx on public.payments(tanggal_pembayaran);
create index if not exists expenses_tanggal_idx on public.expenses(tanggal_pengeluaran);
create index if not exists expenses_kategori_idx on public.expenses(kategori);
