-- Baseline skema LPQ Al-Fath Maulana.
--
-- Dihasilkan dari skema yang berjalan, lalu dilepaskan dari tiga asumsi era
-- Supabase yang membuatnya tidak bisa dipasang di platform:
--
--   1. Nama ter-kualifikasi `public.`. Di platform tiap aplikasi memiliki satu
--      schema di dalam database tenant bersama, dan role-nya tidak punya hak
--      CREATE di `public`. Semua nama di sini tak ter-kualifikasi sehingga
--      mengikuti search_path — `public` pada pemasangan mandiri, schema milik
--      aplikasi di platform.
--   2. Schema `auth`, `storage`, dan `extensions`. Ketiganya butuh superuser
--      untuk dibuat. `auth.users` masih dipakai sebagai tabel identitas, jadi
--      ia pindah ke dalam schema aplikasi sebagai `auth_users`; stub `storage`
--      tidak pernah disentuh kode Go dan dibuang.
--   3. Row Level Security beserta role anon/authenticated/service_role.
--      Otorisasi ditegakkan di lapisan Go (docs/migration/authz-spec.md); 108
--      policy yang bergantung pada auth.uid() tidak pernah dievaluasi dan
--      tidak bisa dibuat tanpa role tersebut.
--
-- Dari 32 fungsi hanya empat yang tersisa: dua penopang trigger, dua dipanggil
-- Go. Sisanya penopang RLS atau RPC yang sudah di-port ke Go.

-- Tubuh fungsi LANGUAGE sql divalidasi saat dibuat, sedangkan urutan di berkas
-- ini menempatkan fungsi sebelum tabel yang dirujuknya. LOCAL: hanya berlaku
-- untuk transaksi migrasi, tidak bocor ke koneksi yang dipakai aplikasi.
SET LOCAL check_function_bodies = false;



--
-- Name: account_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE account_status AS ENUM (
    'active',
    'inactive',
    'suspended'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE app_role AS ENUM (
    'admin',
    'guru',
    'santri',
    'pentashih'
);


--
-- Name: payment_visibility_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE payment_visibility_status AS ENUM (
    'Lunas',
    'Belum Lunas'
);


--
-- Name: consume_auth_throttle(text, text, integer, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION consume_auth_throttle(p_bucket text, p_key text, p_max integer, p_window interval) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  v_count integer;
begin
  insert into auth_throttle as rl (bucket, key, window_start, count)
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


--
-- Name: reset_auth_throttle(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION reset_auth_throttle(p_bucket text, p_key text) RETURNS void
    LANGUAGE sql
    AS $$
  delete from auth_throttle
  where bucket = p_bucket and key = p_key;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_hafalan_status_from_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION sync_hafalan_status_from_score() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.status := case when new.score = 4 then 'lulus' else 'proses' end;
  return new;
end;
$$;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: academic_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE academic_calendar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    title text NOT NULL,
    description text,
    is_holiday boolean DEFAULT false NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    event_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT academic_calendar_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    content jsonb,
    cover_image_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    priority text,
    valid_until date,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT announcements_priority_check CHECK (((priority IS NULL) OR (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])))),
    CONSTRAINT announcements_slug_not_blank CHECK ((length(btrim(slug)) > 0)),
    CONSTRAINT announcements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT announcements_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role app_role NOT NULL,
    attendance_date date NOT NULL,
    check_in_time time without time zone,
    check_in_timestamp timestamp with time zone,
    class_id uuid,
    sesi text,
    status text DEFAULT 'Hadir'::text NOT NULL,
    source text DEFAULT 'rfid'::text NOT NULL,
    correction_reason text,
    corrected_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    attended_session text,
    CONSTRAINT attendance_correction_reason_required CHECK (((corrected_by IS NULL) OR (length(btrim(COALESCE(correction_reason, ''::text))) > 0))),
    CONSTRAINT attendance_source_check CHECK ((source = ANY (ARRAY['rfid'::text, 'manual'::text, 'correction'::text, 'import'::text]))),
    CONSTRAINT attendance_status_not_blank CHECK ((length(btrim(status)) > 0))
);


--
-- Name: COLUMN attendance.sesi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN attendance.sesi IS 'Registered session used for the attendance obligation and existing uniqueness rule.';


--
-- Name: COLUMN attendance.attended_session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN attendance.attended_session IS 'Actual session window used when the santri checked in; may differ from sesi.';


--
-- Name: auth_login_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE auth_login_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    alias_type text DEFAULT 'nomor_induk_qiroati'::text NOT NULL,
    alias_value text NOT NULL,
    normalized_alias text NOT NULL,
    internal_email text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_login_aliases_alias_no_space CHECK ((alias_value !~ '\s'::text)),
    CONSTRAINT auth_login_aliases_alias_trimmed CHECK ((alias_value = btrim(alias_value))),
    CONSTRAINT auth_login_aliases_alias_type_check CHECK ((alias_type = 'nomor_induk_qiroati'::text)),
    CONSTRAINT auth_login_aliases_internal_email_not_blank CHECK ((length(btrim(internal_email)) > 0)),
    CONSTRAINT auth_login_aliases_normalized_not_blank CHECK ((length(btrim(normalized_alias)) > 0))
);


--
-- Name: auth_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE auth_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purpose text NOT NULL,
    ip_hash text NOT NULL,
    alias_hash text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    blocked_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_rate_limits_attempts_non_negative CHECK ((attempts >= 0))
);


--
-- Name: auth_throttle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE auth_throttle (
    bucket text NOT NULL,
    key text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    CONSTRAINT auth_throttle_count_non_negative CHECK ((count >= 0))
);


--
-- Name: TABLE auth_throttle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE auth_throttle IS 'Fixed-window counters for login/feedback throttling. Rows are disposable; safe to truncate.';


--
-- Name: character_assessment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE character_assessment_items (
    id smallint NOT NULL,
    item_order smallint NOT NULL,
    item_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_assessment_items_name_not_blank CHECK ((length(btrim(item_name)) > 0)),
    CONSTRAINT character_assessment_items_order_positive CHECK ((item_order > 0))
);


--
-- Name: class_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE class_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    class_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status text DEFAULT 'active'::text NOT NULL,
    order_in_class integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT class_memberships_date_order CHECK (((end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT class_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'moved'::text, 'graduated'::text])))
);


--
-- Name: class_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE class_mutations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    from_class_id uuid,
    to_class_id uuid,
    mutation_date date DEFAULT CURRENT_DATE NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama_kelas text NOT NULL,
    id_guru uuid,
    sesi text,
    kategori text,
    sort_order integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT classes_nama_kelas_not_blank CHECK ((length(btrim(nama_kelas)) > 0))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tanggal_pengeluaran date NOT NULL,
    kategori text,
    deskripsi text,
    jumlah numeric(12,2) NOT NULL,
    bukti_url text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT expenses_jumlah_check CHECK ((jumlah >= (0)::numeric))
);


--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE feedbacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nama text,
    email text,
    phone text,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    handled_by uuid,
    handled_at timestamp with time zone,
    CONSTRAINT feedbacks_message_not_blank CHECK ((length(btrim(message)) > 0)),
    CONSTRAINT feedbacks_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'closed'::text, 'spam'::text])))
);


--
-- Name: forum_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE forum_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    content text NOT NULL,
    author_id uuid NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT forum_replies_author_name_max_len CHECK ((length(author_name) <= 120)),
    CONSTRAINT forum_replies_author_name_not_blank CHECK ((length(btrim(author_name)) > 0)),
    CONSTRAINT forum_replies_author_role_check CHECK ((author_role = ANY (ARRAY['admin'::text, 'guru'::text, 'santri'::text, 'pentashih'::text]))),
    CONSTRAINT forum_replies_content_max_len CHECK ((length(content) <= 10000)),
    CONSTRAINT forum_replies_content_not_blank CHECK ((length(btrim(content)) > 0))
);


--
-- Name: forum_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE forum_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    author_id uuid NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT forum_topics_author_name_max_len CHECK ((length(author_name) <= 120)),
    CONSTRAINT forum_topics_author_name_not_blank CHECK ((length(btrim(author_name)) > 0)),
    CONSTRAINT forum_topics_author_role_check CHECK ((author_role = ANY (ARRAY['admin'::text, 'guru'::text, 'santri'::text, 'pentashih'::text]))),
    CONSTRAINT forum_topics_content_max_len CHECK ((length(content) <= 10000)),
    CONSTRAINT forum_topics_content_not_blank CHECK ((length(btrim(content)) > 0)),
    CONSTRAINT forum_topics_title_max_len CHECK ((length(title) <= 200)),
    CONSTRAINT forum_topics_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: guru; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE guru (
    id uuid NOT NULL,
    nama text NOT NULL,
    email text,
    no_hp text,
    alamat text,
    foto_url text,
    rfid_tag text,
    jabatan text,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    is_notulen boolean DEFAULT false NOT NULL,
    jenis_kelamin text,
    tanggal_lahir date,
    status_guru text,
    status account_status DEFAULT 'active'::account_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    avatar_path text,
    password text,
    CONSTRAINT guru_avatar_path_expected CHECK (((avatar_path IS NULL) OR (avatar_path = (('guru/'::text || (id)::text) || '/profile.webp'::text)))),
    CONSTRAINT guru_email_trimmed CHECK (((email IS NULL) OR (email = btrim(email)))),
    CONSTRAINT guru_nama_not_blank CHECK ((length(btrim(nama)) > 0))
);


--
-- Name: hafalan_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE hafalan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    jilid text,
    item_name text NOT NULL,
    item_order integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    program_scope text DEFAULT 'TPQ'::text NOT NULL,
    CONSTRAINT hafalan_items_category_not_blank CHECK ((length(btrim(category)) > 0)),
    CONSTRAINT hafalan_items_name_not_blank CHECK ((length(btrim(item_name)) > 0)),
    CONSTRAINT hafalan_items_program_scope_check CHECK ((program_scope = ANY (ARRAY['TPQ'::text, 'PTPT'::text])))
);


--
-- Name: COLUMN hafalan_items.program_scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN hafalan_items.program_scope IS 'Separates TPQ memorization content from the PTPT tahfizh curriculum.';


--
-- Name: hafalan_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE hafalan_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    item_id uuid,
    category text,
    item_name text,
    status text DEFAULT 'belum'::text NOT NULL,
    nilai text,
    catatan text,
    assessed_by uuid,
    assessed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    score smallint DEFAULT 1 NOT NULL,
    CONSTRAINT hafalan_progress_score_check CHECK (((score >= 1) AND (score <= 4))),
    CONSTRAINT hafalan_progress_status_check CHECK ((status = ANY (ARRAY['belum'::text, 'proses'::text, 'lulus'::text, 'ulang'::text])))
);


--
-- Name: jilid_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE jilid_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    from_jilid text,
    to_jilid text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid,
    CONSTRAINT jilid_history_from_jilid_not_blank CHECK (((from_jilid IS NULL) OR (length(btrim(from_jilid)) > 0))),
    CONSTRAINT jilid_history_to_jilid_not_blank CHECK ((length(btrim(to_jilid)) > 0))
);


--
-- Name: TABLE jilid_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE jilid_history IS 'Immutable-by-default history of santri jilid changes; non-admin users may only append within their class scope.';


--
-- Name: login_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE login_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role text,
    username_attempt text,
    status text NOT NULL,
    ip_address text,
    city text,
    country text,
    device text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT login_logs_role_check CHECK (((role IS NULL) OR (role = ANY (ARRAY['admin'::text, 'guru'::text, 'santri'::text, 'pentashih'::text])))),
    CONSTRAINT login_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: media_player_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE media_player_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    playback_position integer DEFAULT 0 NOT NULL,
    is_playing boolean DEFAULT false NOT NULL,
    shuffle_enabled boolean DEFAULT false NOT NULL,
    loop_enabled boolean DEFAULT false NOT NULL,
    crossfade_enabled boolean DEFAULT false NOT NULL,
    current_track_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_player_settings_position_non_negative CHECK ((playback_position >= 0))
);


--
-- Name: mmq_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE mmq_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    guru_id uuid NOT NULL,
    attendance_date date NOT NULL,
    check_in_timestamp timestamp with time zone,
    status text DEFAULT 'Hadir'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT mmq_attendance_status_not_blank CHECK ((length(btrim(status)) > 0))
);


--
-- Name: mmq_notulensi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE mmq_notulensi (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    tanggal date NOT NULL,
    judul text NOT NULL,
    isi text,
    notulen_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT mmq_notulensi_judul_not_blank CHECK ((length(btrim(judul)) > 0))
);


--
-- Name: mmq_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE mmq_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_of_week integer,
    start_time time without time zone,
    end_time time without time zone,
    location text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT mmq_schedule_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT mmq_schedule_time_order CHECK (((end_time IS NULL) OR (start_time IS NULL) OR (end_time > start_time)))
);


--
-- Name: murojaah_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE murojaah_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    target_guru_id uuid,
    type text,
    content text,
    recording_path text,
    status text DEFAULT 'menunggu'::text NOT NULL,
    feedback text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT murojaah_submissions_status_check CHECK ((status = ANY (ARRAY['menunggu'::text, 'direview'::text, 'diterima'::text, 'perlu_perbaikan'::text])))
);


--
-- Name: music_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE music_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    artist text,
    filename text,
    storage_path text,
    file_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT music_files_file_url_not_blank CHECK ((length(btrim(file_url)) > 0)),
    CONSTRAINT music_files_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    content jsonb,
    cover_image_url text,
    status text DEFAULT 'draft'::text NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT news_slug_not_blank CHECK ((length(btrim(slug)) > 0)),
    CONSTRAINT news_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT news_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    type text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_title_not_blank CHECK ((length(btrim(title)) > 0))
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    bulan integer,
    tahun integer,
    jumlah numeric(12,2) NOT NULL,
    tanggal_pembayaran date NOT NULL,
    metode_pembayaran text,
    status text DEFAULT 'paid'::text NOT NULL,
    catatan text,
    transaction_id text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT payments_bulan_check CHECK (((bulan >= 1) AND (bulan <= 12))),
    CONSTRAINT payments_jumlah_check CHECK ((jumlah >= (0)::numeric)),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'unpaid'::text, 'void'::text, 'refunded'::text]))),
    CONSTRAINT payments_tahun_check CHECK (((tahun >= 2000) AND (tahun <= 2100)))
);


--
-- Name: santri; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE santri (
    id uuid NOT NULL,
    nomor_induk_qiroati text,
    nama_lengkap text NOT NULL,
    nama_panggilan text,
    kategori text,
    jenis_kelamin text,
    tanggal_lahir date,
    tempat_lahir text,
    alamat text,
    no_hp_ortu text,
    email text,
    foto_url text,
    avatar_path text,
    rfid_tag text,
    current_class_id uuid,
    sesi_mengaji text,
    jilid text,
    status text DEFAULT 'Aktif'::text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    order_in_class integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    nama_ayah text,
    nama_ibu text,
    tanggal_pendaftaran date,
    no_kk text,
    no_nik text,
    berkas_foto boolean DEFAULT false NOT NULL,
    berkas_akta boolean DEFAULT false NOT NULL,
    berkas_kk boolean DEFAULT false NOT NULL,
    berkas_form boolean DEFAULT false NOT NULL,
    link_qiroati text,
    default_spp_amount numeric(12,2),
    archive_reason text,
    archived_by uuid,
    password text,
    CONSTRAINT santri_avatar_path_expected CHECK (((avatar_path IS NULL) OR (avatar_path = (('santri/'::text || (id)::text) || '/profile.webp'::text)))),
    CONSTRAINT santri_default_spp_amount_valid CHECK (((default_spp_amount IS NULL) OR (default_spp_amount >= (10000)::numeric))),
    CONSTRAINT santri_email_trimmed CHECK (((email IS NULL) OR (email = btrim(email)))),
    CONSTRAINT santri_kategori_check CHECK ((kategori = ANY (ARRAY['Anak'::text, 'PTPT'::text, 'Dewasa'::text]))),
    CONSTRAINT santri_nama_lengkap_not_blank CHECK ((length(btrim(nama_lengkap)) > 0)),
    CONSTRAINT santri_nomor_induk_no_space CHECK ((nomor_induk_qiroati !~ '\s'::text)),
    CONSTRAINT santri_nomor_induk_required_for_non_adult CHECK (((kategori = 'Dewasa'::text) OR (nomor_induk_qiroati IS NOT NULL))),
    CONSTRAINT santri_nomor_induk_trimmed CHECK ((nomor_induk_qiroati = btrim(nomor_induk_qiroati))),
    CONSTRAINT santri_points_non_negative CHECK ((points >= 0))
);


--
-- Name: COLUMN santri.nomor_induk_qiroati; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN santri.nomor_induk_qiroati IS 'Nomor resmi Qiroati; wajib dan unik untuk santri non-Dewasa, opsional untuk santri Dewasa.';


--
-- Name: COLUMN santri.kategori; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN santri.kategori IS 'Program santri: Anak (TPQ), PTPT (tahfizh), or Dewasa.';


--
-- Name: pentashih_class_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE pentashih_class_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pentashih_id uuid NOT NULL,
    class_id uuid,
    scope text DEFAULT 'class'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at date,
    ends_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    mmq_schedule_id uuid,
    CONSTRAINT pentashih_assignments_scope_check CHECK ((scope = ANY (ARRAY['class'::text, 'mmq'::text, 'both'::text]))),
    CONSTRAINT pentashih_assignments_scope_target_check CHECK ((((scope = 'class'::text) AND (class_id IS NOT NULL) AND (mmq_schedule_id IS NULL)) OR ((scope = 'mmq'::text) AND (class_id IS NULL) AND (mmq_schedule_id IS NOT NULL)) OR ((scope = 'both'::text) AND (class_id IS NOT NULL) AND (mmq_schedule_id IS NOT NULL)))),
    CONSTRAINT pentashih_class_assignments_date_order CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at)))
);


--
-- Name: santri_behavior_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE santri_behavior_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    guru_id uuid,
    incident_date date DEFAULT CURRENT_DATE NOT NULL,
    level text NOT NULL,
    behavior text NOT NULL,
    follow_up text NOT NULL,
    teacher_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT santri_behavior_records_behavior_not_blank CHECK ((length(btrim(behavior)) > 0)),
    CONSTRAINT santri_behavior_records_follow_up_not_blank CHECK ((length(btrim(follow_up)) > 0)),
    CONSTRAINT santri_behavior_records_level_check CHECK ((level = ANY (ARRAY['Ringan'::text, 'Sedang'::text, 'Berat'::text])))
);


--
-- Name: santri_character_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE santri_character_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    item_id smallint NOT NULL,
    score smallint NOT NULL,
    assessed_by uuid,
    assessed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT santri_character_scores_score_check CHECK (((score >= 1) AND (score <= 4)))
);


--
-- Name: santri_character_strengths; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE santri_character_strengths (
    santri_id uuid NOT NULL,
    strength_key text NOT NULL,
    selected_by uuid,
    selected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT santri_character_strengths_key_check CHECK ((strength_key = ANY (ARRAY['Disiplin'::text, 'Jujur'::text, 'Mandiri'::text, 'Percaya Diri'::text, 'Bertanggung Jawab'::text, 'Sopan Santun'::text, 'Peduli'::text, 'Rajin Beribadah'::text, 'Semangat Belajar'::text, 'Gemar Membaca Al-Qur''an'::text])))
);


--
-- Name: santri_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE santri_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    santri_id uuid NOT NULL,
    guru_id uuid,
    note text NOT NULL,
    visibility text DEFAULT 'internal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT santri_notes_note_not_blank CHECK ((length(btrim(note)) > 0)),
    CONSTRAINT santri_notes_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'admin_only'::text])))
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE user_profiles (
    id uuid NOT NULL,
    role app_role NOT NULL,
    display_name text,
    email text,
    phone text,
    status account_status DEFAULT 'active'::account_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT user_profiles_display_name_not_blank CHECK (((display_name IS NULL) OR (length(btrim(display_name)) > 0))),
    CONSTRAINT user_profiles_email_not_blank CHECK (((email IS NULL) OR (length(btrim(email)) > 0)))
);


--
-- Name: website_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE website_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT website_content_key_not_blank CHECK ((length(btrim(key)) > 0))
);


--
-- Name: whatsapp_group_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE whatsapp_group_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    jilid text NOT NULL,
    group_name text,
    whatsapp_link text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT whatsapp_group_links_jilid_not_blank CHECK ((length(btrim(jilid)) > 0)),
    CONSTRAINT whatsapp_group_links_url_check CHECK ((whatsapp_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$'::text))
);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth_users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: academic_calendar academic_calendar_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY academic_calendar
    ADD CONSTRAINT academic_calendar_date_key UNIQUE (date);


--
-- Name: academic_calendar academic_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY academic_calendar
    ADD CONSTRAINT academic_calendar_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY announcements
    ADD CONSTRAINT announcements_slug_key UNIQUE (slug);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: auth_login_aliases auth_login_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY auth_login_aliases
    ADD CONSTRAINT auth_login_aliases_pkey PRIMARY KEY (id);


--
-- Name: auth_rate_limits auth_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY auth_rate_limits
    ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: auth_throttle auth_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY auth_throttle
    ADD CONSTRAINT auth_throttle_pkey PRIMARY KEY (bucket, key);


--
-- Name: character_assessment_items character_assessment_items_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY character_assessment_items
    ADD CONSTRAINT character_assessment_items_item_name_key UNIQUE (item_name);


--
-- Name: character_assessment_items character_assessment_items_item_order_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY character_assessment_items
    ADD CONSTRAINT character_assessment_items_item_order_key UNIQUE (item_order);


--
-- Name: character_assessment_items character_assessment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY character_assessment_items
    ADD CONSTRAINT character_assessment_items_pkey PRIMARY KEY (id);


--
-- Name: class_memberships class_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_memberships
    ADD CONSTRAINT class_memberships_pkey PRIMARY KEY (id);


--
-- Name: class_mutations class_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_mutations
    ADD CONSTRAINT class_mutations_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedbacks
    ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);


--
-- Name: forum_replies forum_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY forum_replies
    ADD CONSTRAINT forum_replies_pkey PRIMARY KEY (id);


--
-- Name: forum_topics forum_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY forum_topics
    ADD CONSTRAINT forum_topics_pkey PRIMARY KEY (id);


--
-- Name: guru guru_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY guru
    ADD CONSTRAINT guru_pkey PRIMARY KEY (id);


--
-- Name: hafalan_items hafalan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_items
    ADD CONSTRAINT hafalan_items_pkey PRIMARY KEY (id);


--
-- Name: hafalan_progress hafalan_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_pkey PRIMARY KEY (id);


--
-- Name: jilid_history jilid_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jilid_history
    ADD CONSTRAINT jilid_history_pkey PRIMARY KEY (id);


--
-- Name: login_logs login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY login_logs
    ADD CONSTRAINT login_logs_pkey PRIMARY KEY (id);


--
-- Name: media_player_settings media_player_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_player_settings
    ADD CONSTRAINT media_player_settings_pkey PRIMARY KEY (id);


--
-- Name: mmq_attendance mmq_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_attendance
    ADD CONSTRAINT mmq_attendance_pkey PRIMARY KEY (id);


--
-- Name: mmq_notulensi mmq_notulensi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_notulensi
    ADD CONSTRAINT mmq_notulensi_pkey PRIMARY KEY (id);


--
-- Name: mmq_schedule mmq_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_schedule
    ADD CONSTRAINT mmq_schedule_pkey PRIMARY KEY (id);


--
-- Name: murojaah_submissions murojaah_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY murojaah_submissions
    ADD CONSTRAINT murojaah_submissions_pkey PRIMARY KEY (id);


--
-- Name: music_files music_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY music_files
    ADD CONSTRAINT music_files_pkey PRIMARY KEY (id);


--
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- Name: news news_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY news
    ADD CONSTRAINT news_slug_key UNIQUE (slug);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: pentashih_class_assignments pentashih_class_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_class_assignments_pkey PRIMARY KEY (id);


--
-- Name: santri_behavior_records santri_behavior_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_behavior_records
    ADD CONSTRAINT santri_behavior_records_pkey PRIMARY KEY (id);


--
-- Name: santri_character_scores santri_character_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_pkey PRIMARY KEY (id);


--
-- Name: santri_character_scores santri_character_scores_santri_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_santri_item_unique UNIQUE (santri_id, item_id);


--
-- Name: santri_character_strengths santri_character_strengths_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_strengths
    ADD CONSTRAINT santri_character_strengths_pkey PRIMARY KEY (santri_id, strength_key);


--
-- Name: santri_notes santri_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_notes
    ADD CONSTRAINT santri_notes_pkey PRIMARY KEY (id);


--
-- Name: santri santri_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: website_content website_content_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY website_content
    ADD CONSTRAINT website_content_key_key UNIQUE (key);


--
-- Name: website_content website_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY website_content
    ADD CONSTRAINT website_content_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_group_links whatsapp_group_links_jilid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY whatsapp_group_links
    ADD CONSTRAINT whatsapp_group_links_jilid_key UNIQUE (jilid);


--
-- Name: whatsapp_group_links whatsapp_group_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY whatsapp_group_links
    ADD CONSTRAINT whatsapp_group_links_pkey PRIMARY KEY (id);


--
-- Name: academic_calendar_event_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_calendar_event_type_idx ON academic_calendar USING btree (event_type);


--
-- Name: academic_calendar_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_calendar_public_idx ON academic_calendar USING btree (is_public);


--
-- Name: announcements_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_published_at_idx ON announcements USING btree (published_at);


--
-- Name: announcements_published_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_published_status_idx ON announcements USING btree (status, published_at);


--
-- Name: announcements_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcements_status_idx ON announcements USING btree (status);


--
-- Name: attendance_attended_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_attended_session_idx ON attendance USING btree (attended_session) WHERE (role = 'santri'::app_role);


--
-- Name: attendance_class_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_class_date_idx ON attendance USING btree (class_id, attendance_date);


--
-- Name: attendance_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_class_id_idx ON attendance USING btree (class_id);


--
-- Name: attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_date_idx ON attendance USING btree (attendance_date);


--
-- Name: attendance_role_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_role_date_idx ON attendance USING btree (role, attendance_date);


--
-- Name: attendance_santri_first_daily_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_santri_first_daily_unique ON attendance USING btree (user_id, attendance_date) WHERE ((role = 'santri'::app_role) AND (source <> 'import'::text));


--
-- Name: attendance_user_date_sesi_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_user_date_sesi_unique ON attendance USING btree (user_id, attendance_date, COALESCE(sesi, ''::text)) WHERE (source <> 'import'::text);


--
-- Name: attendance_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_user_id_idx ON attendance USING btree (user_id);


--
-- Name: auth_login_aliases_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_login_aliases_active_idx ON auth_login_aliases USING btree (is_active);


--
-- Name: auth_login_aliases_active_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_login_aliases_active_user_unique ON auth_login_aliases USING btree (auth_user_id) WHERE is_active;


--
-- Name: auth_login_aliases_type_normalized_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_login_aliases_type_normalized_unique ON auth_login_aliases USING btree (alias_type, normalized_alias);


--
-- Name: auth_rate_limits_blocked_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_rate_limits_blocked_until_idx ON auth_rate_limits USING btree (blocked_until);


--
-- Name: auth_rate_limits_purpose_ip_alias_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_rate_limits_purpose_ip_alias_unique ON auth_rate_limits USING btree (purpose, ip_hash, alias_hash);


--
-- Name: auth_throttle_window_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_throttle_window_start_idx ON auth_throttle USING btree (window_start);


--
-- Name: class_memberships_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_memberships_class_id_idx ON class_memberships USING btree (class_id);


--
-- Name: class_memberships_class_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_memberships_class_status_idx ON class_memberships USING btree (class_id, status);


--
-- Name: class_memberships_one_active_per_santri; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX class_memberships_one_active_per_santri ON class_memberships USING btree (santri_id) WHERE (status = 'active'::text);


--
-- Name: class_memberships_santri_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX class_memberships_santri_id_idx ON class_memberships USING btree (santri_id);


--
-- Name: classes_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_active_idx ON classes USING btree (is_active);


--
-- Name: classes_id_guru_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_id_guru_idx ON classes USING btree (id_guru);


--
-- Name: expenses_kategori_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_kategori_idx ON expenses USING btree (kategori);


--
-- Name: expenses_tanggal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_tanggal_idx ON expenses USING btree (tanggal_pengeluaran);


--
-- Name: feedbacks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedbacks_status_idx ON feedbacks USING btree (status);


--
-- Name: forum_replies_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_replies_author_idx ON forum_replies USING btree (author_id);


--
-- Name: forum_replies_live_topic_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_replies_live_topic_created_at_idx ON forum_replies USING btree (topic_id, created_at) WHERE (deleted_at IS NULL);


--
-- Name: forum_topics_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_topics_author_idx ON forum_topics USING btree (author_id);


--
-- Name: forum_topics_live_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX forum_topics_live_created_at_idx ON forum_topics USING btree (created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: guru_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guru_email_unique ON guru USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: guru_rfid_tag_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guru_rfid_tag_unique ON guru USING btree (rfid_tag) WHERE (rfid_tag IS NOT NULL);


--
-- Name: guru_roles_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guru_roles_gin_idx ON guru USING gin (roles);


--
-- Name: guru_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guru_status_idx ON guru USING btree (status);


--
-- Name: hafalan_items_category_jilid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_items_category_jilid_idx ON hafalan_items USING btree (category, jilid);


--
-- Name: hafalan_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_items_order_idx ON hafalan_items USING btree (item_order);


--
-- Name: hafalan_items_program_scope_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_items_program_scope_category_idx ON hafalan_items USING btree (program_scope, category, jilid, item_order) WHERE is_active;


--
-- Name: hafalan_progress_assessed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_progress_assessed_by_idx ON hafalan_progress USING btree (assessed_by);


--
-- Name: hafalan_progress_santri_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_progress_santri_idx ON hafalan_progress USING btree (santri_id);


--
-- Name: hafalan_progress_santri_item_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hafalan_progress_santri_item_unique ON hafalan_progress USING btree (santri_id, item_id) WHERE (item_id IS NOT NULL);


--
-- Name: hafalan_progress_santri_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hafalan_progress_santri_status_idx ON hafalan_progress USING btree (santri_id, status);


--
-- Name: jilid_history_changed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jilid_history_changed_at_idx ON jilid_history USING btree (changed_at DESC);


--
-- Name: jilid_history_santri_changed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jilid_history_santri_changed_at_idx ON jilid_history USING btree (santri_id, changed_at DESC);


--
-- Name: login_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_logs_created_at_idx ON login_logs USING btree (created_at DESC);


--
-- Name: login_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_logs_status_idx ON login_logs USING btree (status);


--
-- Name: media_player_settings_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_player_settings_user_unique ON media_player_settings USING btree (user_id);


--
-- Name: mmq_attendance_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mmq_attendance_date_idx ON mmq_attendance USING btree (attendance_date);


--
-- Name: mmq_attendance_guru_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mmq_attendance_guru_idx ON mmq_attendance USING btree (guru_id);


--
-- Name: mmq_attendance_schedule_guru_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mmq_attendance_schedule_guru_date_unique ON mmq_attendance USING btree (schedule_id, guru_id, attendance_date);


--
-- Name: mmq_notulensi_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mmq_notulensi_schedule_idx ON mmq_notulensi USING btree (schedule_id);


--
-- Name: mmq_notulensi_tanggal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mmq_notulensi_tanggal_idx ON mmq_notulensi USING btree (tanggal);


--
-- Name: mmq_schedule_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mmq_schedule_active_idx ON mmq_schedule USING btree (is_active);


--
-- Name: murojaah_submissions_santri_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX murojaah_submissions_santri_idx ON murojaah_submissions USING btree (santri_id);


--
-- Name: murojaah_submissions_santri_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX murojaah_submissions_santri_status_idx ON murojaah_submissions USING btree (santri_id, status);


--
-- Name: murojaah_submissions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX murojaah_submissions_status_idx ON murojaah_submissions USING btree (status);


--
-- Name: murojaah_submissions_target_guru_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX murojaah_submissions_target_guru_idx ON murojaah_submissions USING btree (target_guru_id);


--
-- Name: news_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_published_at_idx ON news USING btree (published_at);


--
-- Name: news_published_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_published_status_idx ON news USING btree (status, published_at);


--
-- Name: news_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX news_status_idx ON news USING btree (status);


--
-- Name: notifications_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_read_idx ON notifications USING btree (recipient_id, is_read);


--
-- Name: notifications_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_idx ON notifications USING btree (recipient_id);


--
-- Name: payments_active_santri_bulan_tahun_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_active_santri_bulan_tahun_unique ON payments USING btree (santri_id, bulan, tahun) WHERE ((deleted_at IS NULL) AND (bulan IS NOT NULL) AND (tahun IS NOT NULL));


--
-- Name: payments_santri_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_santri_id_idx ON payments USING btree (santri_id);


--
-- Name: payments_santri_month_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_santri_month_year_idx ON payments USING btree (santri_id, tahun, bulan);


--
-- Name: payments_tanggal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_tanggal_idx ON payments USING btree (tanggal_pembayaran);


--
-- Name: payments_transaction_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_transaction_id_unique ON payments USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);


--
-- Name: payments_year_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_year_month_idx ON payments USING btree (tahun, bulan);


--
-- Name: pentashih_assignments_active_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pentashih_assignments_active_scope_unique ON pentashih_class_assignments USING btree (pentashih_id, COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(mmq_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid), scope) WHERE is_active;


--
-- Name: pentashih_assignments_mmq_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pentashih_assignments_mmq_schedule_idx ON pentashih_class_assignments USING btree (mmq_schedule_id);


--
-- Name: pentashih_class_assignments_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pentashih_class_assignments_active_unique ON pentashih_class_assignments USING btree (pentashih_id, class_id) WHERE is_active;


--
-- Name: pentashih_class_assignments_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pentashih_class_assignments_class_idx ON pentashih_class_assignments USING btree (class_id);


--
-- Name: pentashih_class_assignments_pentashih_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pentashih_class_assignments_pentashih_idx ON pentashih_class_assignments USING btree (pentashih_id);


--
-- Name: santri_archive_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_archive_status_idx ON santri USING btree (deleted_at, status, kategori);


--
-- Name: santri_behavior_records_santri_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_behavior_records_santri_date_idx ON santri_behavior_records USING btree (santri_id, incident_date DESC);


--
-- Name: santri_character_scores_santri_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_character_scores_santri_idx ON santri_character_scores USING btree (santri_id);


--
-- Name: santri_current_class_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_current_class_id_idx ON santri USING btree (current_class_id);


--
-- Name: santri_kategori_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_kategori_idx ON santri USING btree (kategori);


--
-- Name: santri_nomor_induk_qiroati_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX santri_nomor_induk_qiroati_unique ON santri USING btree (nomor_induk_qiroati);


--
-- Name: santri_notes_guru_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_notes_guru_idx ON santri_notes USING btree (guru_id);


--
-- Name: santri_notes_santri_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_notes_santri_idx ON santri_notes USING btree (santri_id);


--
-- Name: santri_rfid_tag_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX santri_rfid_tag_unique ON santri USING btree (rfid_tag) WHERE (rfid_tag IS NOT NULL);


--
-- Name: santri_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_status_idx ON santri USING btree (status);


--
-- Name: santri_tanggal_pendaftaran_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX santri_tanggal_pendaftaran_idx ON santri USING btree (tanggal_pendaftaran);


--
-- Name: user_profiles_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_profiles_email_unique ON user_profiles USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: user_profiles_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_profiles_role_idx ON user_profiles USING btree (role);


--
-- Name: user_profiles_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_profiles_status_idx ON user_profiles USING btree (status);


--
-- Name: website_content_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX website_content_public_idx ON website_content USING btree (is_public);


--
-- Name: whatsapp_group_links_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_group_links_active_idx ON whatsapp_group_links USING btree (is_active);


--
-- Name: academic_calendar set_academic_calendar_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_academic_calendar_updated_at BEFORE UPDATE ON academic_calendar FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: announcements set_announcements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: attendance set_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_attendance_updated_at BEFORE UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: auth_login_aliases set_auth_login_aliases_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_auth_login_aliases_updated_at BEFORE UPDATE ON auth_login_aliases FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: auth_rate_limits set_auth_rate_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_auth_rate_limits_updated_at BEFORE UPDATE ON auth_rate_limits FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: character_assessment_items set_character_assessment_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_character_assessment_items_updated_at BEFORE UPDATE ON character_assessment_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: class_memberships set_class_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_class_memberships_updated_at BEFORE UPDATE ON class_memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: classes set_classes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_classes_updated_at BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: expenses set_expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: forum_replies set_forum_replies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_forum_replies_updated_at BEFORE UPDATE ON forum_replies FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: forum_topics set_forum_topics_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_forum_topics_updated_at BEFORE UPDATE ON forum_topics FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: guru set_guru_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_guru_updated_at BEFORE UPDATE ON guru FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: hafalan_items set_hafalan_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hafalan_items_updated_at BEFORE UPDATE ON hafalan_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: hafalan_progress set_hafalan_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_hafalan_progress_updated_at BEFORE UPDATE ON hafalan_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: mmq_attendance set_mmq_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_mmq_attendance_updated_at BEFORE UPDATE ON mmq_attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: mmq_notulensi set_mmq_notulensi_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_mmq_notulensi_updated_at BEFORE UPDATE ON mmq_notulensi FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: mmq_schedule set_mmq_schedule_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_mmq_schedule_updated_at BEFORE UPDATE ON mmq_schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: murojaah_submissions set_murojaah_submissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_murojaah_submissions_updated_at BEFORE UPDATE ON murojaah_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: news set_news_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_news_updated_at BEFORE UPDATE ON news FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: payments set_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: pentashih_class_assignments set_pentashih_class_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_pentashih_class_assignments_updated_at BEFORE UPDATE ON pentashih_class_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: santri_behavior_records set_santri_behavior_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_santri_behavior_records_updated_at BEFORE UPDATE ON santri_behavior_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: santri_character_scores set_santri_character_scores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_santri_character_scores_updated_at BEFORE UPDATE ON santri_character_scores FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: santri_notes set_santri_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_santri_notes_updated_at BEFORE UPDATE ON santri_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: santri set_santri_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_santri_updated_at BEFORE UPDATE ON santri FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: user_profiles set_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: website_content set_website_content_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_website_content_updated_at BEFORE UPDATE ON website_content FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: whatsapp_group_links set_whatsapp_group_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_whatsapp_group_links_updated_at BEFORE UPDATE ON whatsapp_group_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();


--
-- Name: hafalan_progress sync_hafalan_status_from_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sync_hafalan_status_from_score BEFORE INSERT OR UPDATE OF score, status ON hafalan_progress FOR EACH ROW EXECUTE FUNCTION sync_hafalan_status_from_score();


--
-- Name: academic_calendar academic_calendar_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY academic_calendar
    ADD CONSTRAINT academic_calendar_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: academic_calendar academic_calendar_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY academic_calendar
    ADD CONSTRAINT academic_calendar_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: announcements announcements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY announcements
    ADD CONSTRAINT announcements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);


--
-- Name: attendance attendance_corrected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_corrected_by_fkey FOREIGN KEY (corrected_by) REFERENCES auth_users(id);


--
-- Name: attendance attendance_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: attendance attendance_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: auth_login_aliases auth_login_aliases_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY auth_login_aliases
    ADD CONSTRAINT auth_login_aliases_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: class_memberships class_memberships_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_memberships
    ADD CONSTRAINT class_memberships_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;


--
-- Name: class_memberships class_memberships_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_memberships
    ADD CONSTRAINT class_memberships_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: class_memberships class_memberships_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_memberships
    ADD CONSTRAINT class_memberships_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: class_memberships class_memberships_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_memberships
    ADD CONSTRAINT class_memberships_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: class_mutations class_mutations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_mutations
    ADD CONSTRAINT class_mutations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: class_mutations class_mutations_from_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_mutations
    ADD CONSTRAINT class_mutations_from_class_id_fkey FOREIGN KEY (from_class_id) REFERENCES classes(id);


--
-- Name: class_mutations class_mutations_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_mutations
    ADD CONSTRAINT class_mutations_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: class_mutations class_mutations_to_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_mutations
    ADD CONSTRAINT class_mutations_to_class_id_fkey FOREIGN KEY (to_class_id) REFERENCES classes(id);


--
-- Name: classes classes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY classes
    ADD CONSTRAINT classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: classes classes_id_guru_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY classes
    ADD CONSTRAINT classes_id_guru_fkey FOREIGN KEY (id_guru) REFERENCES guru(id);


--
-- Name: classes classes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY classes
    ADD CONSTRAINT classes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: expenses expenses_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY expenses
    ADD CONSTRAINT expenses_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: feedbacks feedbacks_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY feedbacks
    ADD CONSTRAINT feedbacks_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES auth_users(id);


--
-- Name: forum_replies forum_replies_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY forum_replies
    ADD CONSTRAINT forum_replies_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: forum_replies forum_replies_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY forum_replies
    ADD CONSTRAINT forum_replies_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES forum_topics(id) ON DELETE CASCADE;


--
-- Name: forum_topics forum_topics_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY forum_topics
    ADD CONSTRAINT forum_topics_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: guru guru_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY guru
    ADD CONSTRAINT guru_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: guru guru_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY guru
    ADD CONSTRAINT guru_id_fkey FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: guru guru_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY guru
    ADD CONSTRAINT guru_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: hafalan_progress hafalan_progress_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES guru(id);


--
-- Name: hafalan_progress hafalan_progress_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: hafalan_progress hafalan_progress_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_item_id_fkey FOREIGN KEY (item_id) REFERENCES hafalan_items(id) ON DELETE SET NULL;


--
-- Name: hafalan_progress hafalan_progress_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: hafalan_progress hafalan_progress_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY hafalan_progress
    ADD CONSTRAINT hafalan_progress_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: jilid_history jilid_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jilid_history
    ADD CONSTRAINT jilid_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth_users(id) ON DELETE SET NULL;


--
-- Name: jilid_history jilid_history_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY jilid_history
    ADD CONSTRAINT jilid_history_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: login_logs login_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY login_logs
    ADD CONSTRAINT login_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE SET NULL;


--
-- Name: media_player_settings media_player_settings_current_track_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_player_settings
    ADD CONSTRAINT media_player_settings_current_track_id_fkey FOREIGN KEY (current_track_id) REFERENCES music_files(id) ON DELETE SET NULL;


--
-- Name: media_player_settings media_player_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY media_player_settings
    ADD CONSTRAINT media_player_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: mmq_attendance mmq_attendance_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_attendance
    ADD CONSTRAINT mmq_attendance_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: mmq_attendance mmq_attendance_guru_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_attendance
    ADD CONSTRAINT mmq_attendance_guru_id_fkey FOREIGN KEY (guru_id) REFERENCES guru(id) ON DELETE CASCADE;


--
-- Name: mmq_attendance mmq_attendance_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_attendance
    ADD CONSTRAINT mmq_attendance_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES mmq_schedule(id) ON DELETE CASCADE;


--
-- Name: mmq_attendance mmq_attendance_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_attendance
    ADD CONSTRAINT mmq_attendance_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: mmq_notulensi mmq_notulensi_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_notulensi
    ADD CONSTRAINT mmq_notulensi_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: mmq_notulensi mmq_notulensi_notulen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_notulensi
    ADD CONSTRAINT mmq_notulensi_notulen_id_fkey FOREIGN KEY (notulen_id) REFERENCES guru(id);


--
-- Name: mmq_notulensi mmq_notulensi_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_notulensi
    ADD CONSTRAINT mmq_notulensi_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES mmq_schedule(id) ON DELETE CASCADE;


--
-- Name: mmq_notulensi mmq_notulensi_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_notulensi
    ADD CONSTRAINT mmq_notulensi_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: mmq_schedule mmq_schedule_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_schedule
    ADD CONSTRAINT mmq_schedule_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: mmq_schedule mmq_schedule_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY mmq_schedule
    ADD CONSTRAINT mmq_schedule_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: murojaah_submissions murojaah_submissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY murojaah_submissions
    ADD CONSTRAINT murojaah_submissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: murojaah_submissions murojaah_submissions_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY murojaah_submissions
    ADD CONSTRAINT murojaah_submissions_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: murojaah_submissions murojaah_submissions_target_guru_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY murojaah_submissions
    ADD CONSTRAINT murojaah_submissions_target_guru_id_fkey FOREIGN KEY (target_guru_id) REFERENCES guru(id);


--
-- Name: murojaah_submissions murojaah_submissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY murojaah_submissions
    ADD CONSTRAINT murojaah_submissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: music_files music_files_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY music_files
    ADD CONSTRAINT music_files_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: music_files music_files_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY music_files
    ADD CONSTRAINT music_files_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: news news_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY news
    ADD CONSTRAINT news_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: news news_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY news
    ADD CONSTRAINT news_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: payments payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: payments payments_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: payments payments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY payments
    ADD CONSTRAINT payments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: pentashih_class_assignments pentashih_assignments_mmq_schedule_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_assignments_mmq_schedule_fkey FOREIGN KEY (mmq_schedule_id) REFERENCES mmq_schedule(id) ON DELETE CASCADE;


--
-- Name: pentashih_class_assignments pentashih_class_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_class_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;


--
-- Name: pentashih_class_assignments pentashih_class_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_class_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: pentashih_class_assignments pentashih_class_assignments_pentashih_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_class_assignments_pentashih_id_fkey FOREIGN KEY (pentashih_id) REFERENCES guru(id) ON DELETE CASCADE;


--
-- Name: pentashih_class_assignments pentashih_class_assignments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY pentashih_class_assignments
    ADD CONSTRAINT pentashih_class_assignments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: santri santri_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth_users(id);


--
-- Name: santri_behavior_records santri_behavior_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_behavior_records
    ADD CONSTRAINT santri_behavior_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: santri_behavior_records santri_behavior_records_guru_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_behavior_records
    ADD CONSTRAINT santri_behavior_records_guru_id_fkey FOREIGN KEY (guru_id) REFERENCES guru(id);


--
-- Name: santri_behavior_records santri_behavior_records_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_behavior_records
    ADD CONSTRAINT santri_behavior_records_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: santri_behavior_records santri_behavior_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_behavior_records
    ADD CONSTRAINT santri_behavior_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: santri_character_scores santri_character_scores_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES guru(id);


--
-- Name: santri_character_scores santri_character_scores_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: santri_character_scores santri_character_scores_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_item_id_fkey FOREIGN KEY (item_id) REFERENCES character_assessment_items(id);


--
-- Name: santri_character_scores santri_character_scores_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: santri_character_scores santri_character_scores_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_scores
    ADD CONSTRAINT santri_character_scores_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: santri_character_strengths santri_character_strengths_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_strengths
    ADD CONSTRAINT santri_character_strengths_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: santri_character_strengths santri_character_strengths_selected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_character_strengths
    ADD CONSTRAINT santri_character_strengths_selected_by_fkey FOREIGN KEY (selected_by) REFERENCES guru(id);


--
-- Name: santri santri_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: santri santri_current_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_current_class_id_fkey FOREIGN KEY (current_class_id) REFERENCES classes(id);


--
-- Name: santri santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_id_fkey FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: santri_notes santri_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_notes
    ADD CONSTRAINT santri_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: santri_notes santri_notes_guru_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_notes
    ADD CONSTRAINT santri_notes_guru_id_fkey FOREIGN KEY (guru_id) REFERENCES guru(id);


--
-- Name: santri_notes santri_notes_santri_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_notes
    ADD CONSTRAINT santri_notes_santri_id_fkey FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE;


--
-- Name: santri_notes santri_notes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri_notes
    ADD CONSTRAINT santri_notes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: santri santri_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY santri
    ADD CONSTRAINT santri_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: user_profiles user_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_profiles
    ADD CONSTRAINT user_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY user_profiles
    ADD CONSTRAINT user_profiles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: website_content website_content_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY website_content
    ADD CONSTRAINT website_content_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id);


--
-- Name: website_content website_content_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY website_content
    ADD CONSTRAINT website_content_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id);


--
-- Name: whatsapp_group_links whatsapp_group_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY whatsapp_group_links
    ADD CONSTRAINT whatsapp_group_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_group_links whatsapp_group_links_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY whatsapp_group_links
    ADD CONSTRAINT whatsapp_group_links_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth_users(id) ON DELETE SET NULL;
