-- Pindahkan tabel identitas dari schema `auth` ke schema aplikasi.
--
-- Pemasangan baru sudah mendapat `auth_users` dari baseline, jadi migrasi ini
-- tidak melakukan apa pun di sana. Yang dituju adalah database yang dibangun
-- sebelum baseline ada: di sana tabelnya masih `auth.users`, warisan era
-- Supabase, sedangkan kode Go sekarang menulis ke `auth_users`. Tanpa langkah
-- ini pembuatan guru dan santri akan gagal pada pemasangan lama.
--
-- Schema tujuan diambil dari current_schema(), bukan dituliskan `public`:
-- di platform schema aplikasi bernama lain, dan migrasi yang memaksa `public`
-- akan memindahkan tabel ke luar jangkauan aplikasi.
--
-- Seluruh foreign key yang menunjuk tabel ini (61 buah) ikut berpindah
-- bersama tabelnya; PostgreSQL memperbarui katalog, bukan nama di dalam DDL.

DO $$
DECLARE
    tujuan text := current_schema();
BEGIN
    IF to_regclass('auth_users') IS NOT NULL THEN
        RETURN;
    END IF;

    IF to_regclass('auth.users') IS NULL THEN
        RAISE EXCEPTION
            'tabel identitas tidak ditemukan: auth_users maupun auth.users tidak ada di %', tujuan;
    END IF;

    EXECUTE format('ALTER TABLE auth.users SET SCHEMA %I', tujuan);
    EXECUTE format('ALTER TABLE %I.users RENAME TO auth_users', tujuan);
END $$;
