-- Logical migration: 0016_rls_policies
-- Purpose: enable RLS and create final access policies.
-- Dependencies: 20260624001500_rls_helper_functions.sql.
-- Safety: no copied legacy policies, no permissive boolean shortcuts, no credential access.

alter table public.user_profiles enable row level security;
alter table public.guru enable row level security;
alter table public.santri enable row level security;
alter table public.auth_login_aliases enable row level security;
alter table public.auth_rate_limits enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.class_mutations enable row level security;
alter table public.pentashih_class_assignments enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.hafalan_items enable row level security;
alter table public.hafalan_progress enable row level security;
alter table public.murojaah_submissions enable row level security;
alter table public.academic_calendar enable row level security;
alter table public.mmq_schedule enable row level security;
alter table public.mmq_attendance enable row level security;
alter table public.mmq_notulensi enable row level security;
alter table public.website_content enable row level security;
alter table public.news enable row level security;
alter table public.announcements enable row level security;
alter table public.feedbacks enable row level security;
alter table public.notifications enable row level security;
alter table public.santri_notes enable row level security;

revoke all on public.auth_login_aliases from anon, authenticated;
revoke all on public.auth_rate_limits from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.expenses from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema public to service_role;

grant select on public.website_content, public.news, public.announcements, public.academic_calendar to anon;
grant insert on public.feedbacks to anon;

grant select, insert, update, delete on
  public.user_profiles,
  public.guru,
  public.santri,
  public.classes,
  public.class_memberships,
  public.class_mutations,
  public.pentashih_class_assignments,
  public.attendance,
  public.payments,
  public.expenses,
  public.hafalan_items,
  public.hafalan_progress,
  public.murojaah_submissions,
  public.academic_calendar,
  public.mmq_schedule,
  public.mmq_attendance,
  public.mmq_notulensi,
  public.website_content,
  public.news,
  public.announcements,
  public.feedbacks,
  public.notifications,
  public.santri_notes
to authenticated;

grant select, insert, update, delete on
  public.user_profiles,
  public.guru,
  public.santri,
  public.auth_login_aliases,
  public.auth_rate_limits,
  public.classes,
  public.class_memberships,
  public.class_mutations,
  public.pentashih_class_assignments,
  public.attendance,
  public.payments,
  public.expenses,
  public.hafalan_items,
  public.hafalan_progress,
  public.murojaah_submissions,
  public.academic_calendar,
  public.mmq_schedule,
  public.mmq_attendance,
  public.mmq_notulensi,
  public.website_content,
  public.news,
  public.announcements,
  public.feedbacks,
  public.notifications,
  public.santri_notes
to service_role;

grant select on public.payment_status_summary to authenticated;

create or replace view public.payment_status_summary as
select *
from (
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
) summary
where public.is_admin()
   or public.user_owns_santri_record(summary.santri_id)
   or public.guru_has_class_access(summary.class_id);

grant select on public.payment_status_summary to authenticated;

-- Public content.
create policy website_content_anon_select_public on public.website_content
  for select to anon
  using (is_public);

create policy website_content_authenticated_select_public on public.website_content
  for select to authenticated
  using (is_public or public.is_admin());

create policy website_content_admin_all on public.website_content
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy news_anon_select_published on public.news
  for select to anon
  using (status = 'published');

create policy news_authenticated_select_published on public.news
  for select to authenticated
  using (status = 'published' or public.is_admin());

create policy news_admin_all on public.news
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy announcements_anon_select_published on public.announcements
  for select to anon
  using (status = 'published' and (valid_until is null or valid_until >= current_date));

create policy announcements_authenticated_select_published on public.announcements
  for select to authenticated
  using ((status = 'published' and (valid_until is null or valid_until >= current_date)) or public.is_admin());

create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy feedbacks_anon_insert on public.feedbacks
  for insert to anon
  with check (true);

create policy feedbacks_admin_all on public.feedbacks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Profiles.
create policy user_profiles_admin_all on public.user_profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy user_profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

-- Guru and santri.
create policy guru_admin_all on public.guru
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy guru_select_scope on public.guru
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.classes c
      join public.class_memberships cm on cm.class_id = c.id and cm.status = 'active'
      where c.id_guru = public.guru.id
        and cm.santri_id = auth.uid()
    )
    or exists (
      select 1
      from public.classes c
      where c.id_guru = public.guru.id
        and public.pentashih_has_class_access(c.id)
    )
  );

create policy santri_admin_all on public.santri
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy santri_select_scope on public.santri
  for select to authenticated
  using (
    id = auth.uid()
    or public.guru_has_santri_access(id)
    or public.pentashih_has_santri_access(id)
    or public.is_admin()
  );

-- Classes and memberships.
create policy classes_admin_all on public.classes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy classes_select_scope on public.classes
  for select to authenticated
  using (
    public.is_admin()
    or id_guru = auth.uid()
    or public.pentashih_has_class_access(id)
    or exists (
      select 1 from public.class_memberships cm
      where cm.class_id = public.classes.id
        and cm.santri_id = auth.uid()
        and cm.status = 'active'
    )
  );

create policy class_memberships_admin_all on public.class_memberships
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy class_memberships_select_scope on public.class_memberships
  for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or public.guru_has_class_access(class_id)
    or public.pentashih_has_class_access(class_id)
  );

create policy class_mutations_admin_all on public.class_mutations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy class_mutations_select_scope on public.class_mutations
  for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );

-- Assignments.
create policy pentashih_assignments_admin_all on public.pentashih_class_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy pentashih_assignments_select_own on public.pentashih_class_assignments
  for select to authenticated
  using (public.is_admin() or pentashih_id = auth.uid());

-- Attendance.
create policy attendance_admin_all on public.attendance
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy attendance_select_scope on public.attendance
  for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or (class_id is not null and public.guru_has_class_access(class_id))
    or (class_id is not null and public.pentashih_has_class_access(class_id))
  );

create policy attendance_insert_update_guru_scope on public.attendance
  for all to authenticated
  using (
    public.is_admin()
    or (class_id is not null and public.guru_has_class_access(class_id))
  )
  with check (
    public.is_admin()
    or (class_id is not null and public.guru_has_class_access(class_id))
  );

-- Finance. Direct payments and expenses are admin/santri only; guru uses view.
create policy payments_admin_all on public.payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payments_santri_select_own on public.payments
  for select to authenticated
  using (santri_id = auth.uid());

create policy expenses_admin_all on public.expenses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Learning.
create policy hafalan_items_admin_all on public.hafalan_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy hafalan_items_authenticated_select on public.hafalan_items
  for select to authenticated
  using (is_active or public.is_admin());

create policy hafalan_progress_admin_all on public.hafalan_progress
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy hafalan_progress_select_scope on public.hafalan_progress
  for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );

create policy hafalan_progress_guru_write_scope on public.hafalan_progress
  for insert to authenticated
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));

create policy hafalan_progress_guru_update_scope on public.hafalan_progress
  for update to authenticated
  using (public.is_admin() or public.guru_has_santri_access(santri_id))
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));

create policy murojaah_admin_all on public.murojaah_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy murojaah_select_scope on public.murojaah_submissions
  for select to authenticated
  using (
    public.is_admin()
    or santri_id = auth.uid()
    or target_guru_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );

create policy murojaah_santri_insert_own on public.murojaah_submissions
  for insert to authenticated
  with check (santri_id = auth.uid() or public.is_admin());

create policy murojaah_guru_update_scope on public.murojaah_submissions
  for update to authenticated
  using (
    public.is_admin()
    or target_guru_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
  )
  with check (
    public.is_admin()
    or target_guru_id = auth.uid()
    or public.guru_has_santri_access(santri_id)
  );

-- Calendar.
create policy academic_calendar_anon_select_public on public.academic_calendar
  for select to anon
  using (is_public);

create policy academic_calendar_authenticated_select on public.academic_calendar
  for select to authenticated
  using (is_public or public.is_admin() or public.is_guru() or public.is_santri() or public.is_pentashih());

create policy academic_calendar_admin_all on public.academic_calendar
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MMQ.
create policy mmq_schedule_admin_all on public.mmq_schedule
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy mmq_schedule_select_scope on public.mmq_schedule
  for select to authenticated
  using (public.is_admin() or public.is_guru() or public.pentashih_has_mmq_access(id));

create policy mmq_attendance_admin_all on public.mmq_attendance
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy mmq_attendance_select_scope on public.mmq_attendance
  for select to authenticated
  using (public.is_admin() or guru_id = auth.uid() or public.pentashih_has_mmq_access(schedule_id));

create policy mmq_attendance_guru_insert_own on public.mmq_attendance
  for insert to authenticated
  with check (public.is_admin() or guru_id = auth.uid());

create policy mmq_notulensi_admin_all on public.mmq_notulensi
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy mmq_notulensi_select_scope on public.mmq_notulensi
  for select to authenticated
  using (public.is_admin() or public.is_guru() or public.pentashih_has_mmq_access(schedule_id));

create policy mmq_notulensi_notulen_insert on public.mmq_notulensi
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (select 1 from public.guru g where g.id = auth.uid() and g.is_notulen)
  );

-- Notes and notifications.
create policy notifications_admin_all on public.notifications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy notifications_user_select_update_own on public.notifications
  for select to authenticated
  using (recipient_id = auth.uid());

create policy notifications_user_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy santri_notes_admin_all on public.santri_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy santri_notes_select_scope on public.santri_notes
  for select to authenticated
  using (
    public.is_admin()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
  );

create policy santri_notes_guru_write_scope on public.santri_notes
  for insert to authenticated
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));

create policy santri_notes_guru_update_scope on public.santri_notes
  for update to authenticated
  using (public.is_admin() or public.guru_has_santri_access(santri_id))
  with check (public.is_admin() or public.guru_has_santri_access(santri_id));
