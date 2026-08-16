package migrate

import (
	"strings"
	"testing"
)

// Baseline dan migrasi lanjutan dijalankan lewat pgx sebagai satu perintah,
// bukan lewat psql. Meta-command psql (\restrict, \connect, \i) akan ditolak
// driver, dan pg_dump memang menyisipkan \restrict pada versi terbaru — jadi
// berkas hasil dump yang lolos begitu saja ke sini akan menggagalkan start
// aplikasi. Diperiksa di sini karena tidak ada tempat lain yang akan tahu.
func TestMigrasiTanpaMetaCommandPsql(t *testing.T) {
	names, err := migrationNames()
	if err != nil {
		t.Fatalf("migrationNames: %v", err)
	}
	for _, name := range names {
		body, err := files.ReadFile("sql/" + name)
		if err != nil {
			t.Fatalf("baca %s: %v", name, err)
		}
		for i, line := range strings.Split(string(body), "\n") {
			if strings.HasPrefix(line, `\`) {
				t.Errorf("%s baris %d: meta-command psql %q tidak dikenali pgx", name, i+1, line)
			}
		}
	}
}

// Setiap nama harus mengurutkan dirinya sendiri: urutan penerapan adalah urutan
// leksikal, dan sebuah berkas tanpa awalan nomor akan menyelip di tempat yang
// tidak diduga saat berkas berikutnya ditambahkan.
func TestNamaMigrasiBerawalanNomor(t *testing.T) {
	names, err := migrationNames()
	if err != nil {
		t.Fatalf("migrationNames: %v", err)
	}
	if len(names) == 0 {
		t.Fatal("tidak ada migrasi yang tertanam")
	}
	for _, name := range names {
		if len(name) < 4 || strings.IndexFunc(name[:4], func(r rune) bool {
			return r < '0' || r > '9'
		}) != -1 {
			t.Errorf("%s: nama migrasi harus diawali empat digit", name)
		}
	}
}

// Baseline tidak boleh memakai nama ter-kualifikasi schema. Di platform tiap
// aplikasi hidup di schema miliknya sendiri; satu saja `public.` yang lolos
// akan menulis ke schema bersama — diam-diam berhasil pada pemasangan mandiri
// dan menembus isolasi tenant di platform.
func TestMigrasiTidakMengualifikasiSchema(t *testing.T) {
	names, err := migrationNames()
	if err != nil {
		t.Fatalf("migrationNames: %v", err)
	}
	// Awalan yang butuh superuser untuk dibuat, jadi tidak boleh muncul sama
	// sekali — kecuali di 0002, yang tugasnya justru memindahkan auth.users
	// keluar dari sana.
	terlarang := []string{"public.", "storage.", "extensions."}
	for _, name := range names {
		body, err := files.ReadFile("sql/" + name)
		if err != nil {
			t.Fatalf("baca %s: %v", name, err)
		}
		for i, line := range strings.Split(string(body), "\n") {
			kode := strings.TrimSpace(line)
			if strings.HasPrefix(kode, "--") {
				continue
			}
			for _, p := range terlarang {
				if strings.Contains(kode, p) {
					t.Errorf("%s baris %d: %q ter-kualifikasi schema: %s", name, i+1, p, kode)
				}
			}
		}
	}
}
