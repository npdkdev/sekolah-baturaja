-- Purpose: add scored hafalan, character development, strengths, and behavior records.
-- Safety: additive schema changes, official master data, and scoped RLS only.

alter table public.hafalan_progress
  add column if not exists score smallint;

update public.hafalan_progress
set score = case status
  when 'lulus' then 4
  when 'proses' then 2
  when 'ulang' then 1
  else 1
end
where score is null;

alter table public.hafalan_progress
  alter column score set default 1,
  alter column score set not null;

alter table public.hafalan_progress
  drop constraint if exists hafalan_progress_score_check;

alter table public.hafalan_progress
  add constraint hafalan_progress_score_check check (score between 1 and 4);

create or replace function public.sync_hafalan_status_from_score()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := case when new.score = 4 then 'lulus' else 'proses' end;
  return new;
end;
$$;

drop trigger if exists sync_hafalan_status_from_score on public.hafalan_progress;
create trigger sync_hafalan_status_from_score
  before insert or update of score, status on public.hafalan_progress
  for each row execute function public.sync_hafalan_status_from_score();

create table if not exists public.character_assessment_items (
  id smallint primary key,
  item_order smallint not null unique,
  item_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_assessment_items_order_positive check (item_order > 0),
  constraint character_assessment_items_name_not_blank check (length(btrim(item_name)) > 0)
);

insert into public.character_assessment_items (id, item_order, item_name)
values
  (1, 1, 'Disiplin hadir tepat waktu'),
  (2, 2, 'Merapikan sandal sebelum masuk'),
  (3, 3, 'Mengucapkan salam'),
  (4, 4, 'Berdoa sebelum dan sesudah belajar'),
  (5, 5, 'Menghormati guru'),
  (6, 6, 'Menghargai teman'),
  (7, 7, 'Mau berbagi'),
  (8, 8, 'Bertanggung jawab terhadap perlengkapan belajar'),
  (9, 9, 'Antri dengan tertib'),
  (10, 10, 'Menjaga kebersihan lingkungan'),
  (11, 11, 'Mengikuti pembelajaran dengan baik'),
  (12, 12, 'Berani membaca Al-Qur''an di depan guru'),
  (13, 13, 'Jujur ketika melakukan kesalahan'),
  (14, 14, 'Mandiri tanpa selalu didampingi orang tua'),
  (15, 15, 'Mampu mengendalikan emosi')
on conflict (id) do update set
  item_order = excluded.item_order,
  item_name = excluded.item_name,
  is_active = true;

create table if not exists public.santri_character_scores (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  item_id smallint not null references public.character_assessment_items(id),
  score smallint not null,
  assessed_by uuid references public.guru(id),
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint santri_character_scores_score_check check (score between 1 and 4),
  constraint santri_character_scores_santri_item_unique unique (santri_id, item_id)
);

create table if not exists public.santri_character_strengths (
  santri_id uuid not null references public.santri(id) on delete cascade,
  strength_key text not null,
  selected_by uuid references public.guru(id),
  selected_at timestamptz not null default now(),
  primary key (santri_id, strength_key),
  constraint santri_character_strengths_key_check check (strength_key in (
    'Disiplin',
    'Jujur',
    'Mandiri',
    'Percaya Diri',
    'Bertanggung Jawab',
    'Sopan Santun',
    'Peduli',
    'Rajin Beribadah',
    'Semangat Belajar',
    'Gemar Membaca Al-Qur''an'
  ))
);

create table if not exists public.santri_behavior_records (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  guru_id uuid references public.guru(id),
  incident_date date not null default current_date,
  level text not null,
  behavior text not null,
  follow_up text not null,
  teacher_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint santri_behavior_records_level_check check (level in ('Ringan', 'Sedang', 'Berat')),
  constraint santri_behavior_records_behavior_not_blank check (length(btrim(behavior)) > 0),
  constraint santri_behavior_records_follow_up_not_blank check (length(btrim(follow_up)) > 0)
);

create index if not exists santri_character_scores_santri_idx
  on public.santri_character_scores(santri_id);
create index if not exists santri_behavior_records_santri_date_idx
  on public.santri_behavior_records(santri_id, incident_date desc);

drop trigger if exists set_character_assessment_items_updated_at on public.character_assessment_items;
create trigger set_character_assessment_items_updated_at
  before update on public.character_assessment_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_santri_character_scores_updated_at on public.santri_character_scores;
create trigger set_santri_character_scores_updated_at
  before update on public.santri_character_scores
  for each row execute function public.set_updated_at();

drop trigger if exists set_santri_behavior_records_updated_at on public.santri_behavior_records;
create trigger set_santri_behavior_records_updated_at
  before update on public.santri_behavior_records
  for each row execute function public.set_updated_at();

alter table public.character_assessment_items enable row level security;
alter table public.santri_character_scores enable row level security;
alter table public.santri_character_strengths enable row level security;
alter table public.santri_behavior_records enable row level security;

create policy character_assessment_items_authenticated_select
  on public.character_assessment_items for select to authenticated
  using (is_active or public.is_admin());
create policy character_assessment_items_admin_all
  on public.character_assessment_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy santri_character_scores_select_scope
  on public.santri_character_scores for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );
create policy santri_character_scores_insert_scope
  on public.santri_character_scores for insert to authenticated
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));
create policy santri_character_scores_update_scope
  on public.santri_character_scores for update to authenticated
  using (public.is_admin() or public.guru_has_santri_access(santri_id))
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));

create policy santri_character_strengths_select_scope
  on public.santri_character_strengths for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );
create policy santri_character_strengths_insert_scope
  on public.santri_character_strengths for insert to authenticated
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));
create policy santri_character_strengths_update_scope
  on public.santri_character_strengths for update to authenticated
  using (public.is_admin() or public.guru_has_santri_access(santri_id))
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));
create policy santri_character_strengths_delete_scope
  on public.santri_character_strengths for delete to authenticated
  using (public.is_admin() or public.guru_has_santri_access(santri_id));

create policy santri_behavior_records_admin_all
  on public.santri_behavior_records for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy santri_behavior_records_guru_select_scope
  on public.santri_behavior_records for select to authenticated
  using (public.guru_has_santri_access(santri_id));
create policy santri_behavior_records_guru_insert_scope
  on public.santri_behavior_records for insert to authenticated
  with check (public.guru_has_santri_access(santri_id));
create policy santri_behavior_records_guru_update_scope
  on public.santri_behavior_records for update to authenticated
  using (public.guru_has_santri_access(santri_id))
  with check (public.guru_has_santri_access(santri_id));

grant select, insert, update, delete on public.character_assessment_items to authenticated;
grant select, insert, update, delete on public.santri_character_scores to authenticated;
grant select, insert, update, delete on public.santri_character_strengths to authenticated;
grant select, insert, update, delete on public.santri_behavior_records to authenticated;

notify pgrst, 'reload schema';
