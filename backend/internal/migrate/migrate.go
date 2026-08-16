// Package migrate menerapkan skema database dari dalam aplikasi.
//
// Sebelumnya migrasi dijalankan oleh entrypoint Postgres lewat
// docker-entrypoint-initdb.d. Cara itu hanya bekerja pada database yang kita
// buat sendiri dan kosong. Di platform (console-platform) database dan schema
// sudah disiapkan control-plane sebelum container aplikasi pernah berjalan,
// tidak ada init hook, dan role aplikasi bukan superuser — jadi tidak ada
// satu pun titik di luar aplikasi yang bisa memasang skemanya.
//
// Karena itu aplikasi memigrasi dirinya sendiri saat start. Berkas SQL
// ditanam ke dalam binary, sehingga image yang sama membawa kode dan skema
// yang cocok: tidak ada lagi kemungkinan container versi baru berjalan di atas
// skema lama karena seseorang lupa menjalankan langkah terpisah.
package migrate

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/*.sql
var files embed.FS

// lockKey mengunci proses migrasi terhadap sesama container aplikasi.
//
// Platform menjalankan satu container per app, tapi redeploy sempat membuat
// yang lama dan yang baru hidup bersamaan, dan dua proses yang menjalankan
// CREATE TABLE yang sama secara bersamaan akan membuat salah satunya gagal
// start. Angkanya sembarang; yang penting konstan di semua versi aplikasi.
const lockKey int64 = 8531207

// baselineTable adalah tabel yang pasti ada pada database era-lama. Dipakai
// untuk membedakan "database kosong" dari "database yang sudah berisi skema
// tapi belum punya catatan migrasi" — lihat Run.
const baselineTable = "santri"

// Run menerapkan semua migrasi yang belum pernah dijalankan.
//
// Aman dipanggil setiap start: migrasi yang sudah tercatat dilewati.
func Run(ctx context.Context, pool *pgxpool.Pool) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("migrate: ambil koneksi: %w", err)
	}
	defer conn.Release()

	names, err := migrationNames()
	if err != nil {
		return err
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("migrate: mulai transaksi: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock tingkat transaksi: dilepas otomatis saat commit atau rollback, jadi
	// proses yang mati di tengah jalan tidak meninggalkan lock menggantung.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey); err != nil {
		return fmt.Errorf("migrate: ambil lock: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("migrate: buat schema_migrations: %w", err)
	}

	applied, err := appliedVersions(ctx, tx)
	if err != nil {
		return err
	}

	// Adopsi, bukan bangun ulang. Database yang sudah dipakai dibangun oleh
	// entrypoint Postgres dan tidak punya schema_migrations, sehingga tanpa
	// langkah ini baseline akan dijalankan di atas skema yang sudah ada dan
	// gagal pada objek pertama yang sudah eksis. Yang benar adalah mencatatnya
	// sebagai sudah diterapkan — memang itulah keadaannya.
	if len(applied) == 0 {
		adopted, err := adoptBaseline(ctx, tx, names)
		if err != nil {
			return err
		}
		if adopted != "" {
			applied[adopted] = true
			log.Printf("migrate: skema lama terdeteksi, %s dicatat sebagai sudah diterapkan", adopted)
		}
	}

	ran := 0
	for _, name := range names {
		if applied[name] {
			continue
		}
		body, err := files.ReadFile("sql/" + name)
		if err != nil {
			return fmt.Errorf("migrate: baca %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			return fmt.Errorf("migrate: terapkan %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			return fmt.Errorf("migrate: catat %s: %w", name, err)
		}
		log.Printf("migrate: terapkan %s", name)
		ran++
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("migrate: commit: %w", err)
	}
	if ran == 0 {
		log.Printf("migrate: skema sudah mutakhir (%d migrasi)", len(names))
	} else {
		log.Printf("migrate: %d migrasi diterapkan", ran)
	}
	return nil
}

// migrationNames mengembalikan nama berkas migrasi terurut. Urutan leksikal
// adalah urutan penerapan, jadi penamaan berkas harus berawalan nomor.
func migrationNames() ([]string, error) {
	entries, err := fs.ReadDir(files, "sql")
	if err != nil {
		return nil, fmt.Errorf("migrate: baca direktori sql: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	if len(names) == 0 {
		return nil, fmt.Errorf("migrate: tidak ada berkas migrasi yang tertanam")
	}
	return names, nil
}

func appliedVersions(ctx context.Context, tx pgx.Tx) (map[string]bool, error) {
	rows, err := tx.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("migrate: baca schema_migrations: %w", err)
	}
	defer rows.Close()

	applied := map[string]bool{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("migrate: baca versi: %w", err)
		}
		applied[v] = true
	}
	return applied, rows.Err()
}

// adoptBaseline mencatat migrasi pertama sebagai sudah diterapkan bila skema
// ternyata sudah ada. Mengembalikan nama yang diadopsi, atau string kosong
// untuk database yang memang masih kosong.
//
// to_regclass menghormati search_path, jadi pertanyaannya adalah "apakah
// schema milik aplikasi ini sudah berisi skemanya" — bukan "apakah ada
// tabel bernama itu di suatu tempat di database". Bedanya penting di
// platform, tempat beberapa aplikasi berbagi satu database tenant.
func adoptBaseline(ctx context.Context, tx pgx.Tx, names []string) (string, error) {
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT to_regclass($1) IS NOT NULL`, baselineTable).Scan(&exists); err != nil {
		return "", fmt.Errorf("migrate: deteksi skema lama: %w", err)
	}
	if !exists {
		return "", nil
	}
	baseline := names[0]
	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations (version) VALUES ($1)`, baseline); err != nil {
		return "", fmt.Errorf("migrate: adopsi %s: %w", baseline, err)
	}
	return baseline, nil
}
