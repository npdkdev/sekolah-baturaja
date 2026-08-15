package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"lpq-backend/internal/middleware"
)

func TestValidPaymentItemKeys(t *testing.T) {
	valid := []string{
		"sarpras",
		"seragam",
		"tas_murid",
		"id_card_murid",
		"buku_paket",
		"lks",
	}
	for _, key := range valid {
		if !isValidPaymentItemKey(key) {
			t.Errorf("isValidPaymentItemKey(%q) = false, want true", key)
		}
	}

	invalid := []string{"spp", "SPP", "custom", "uang_gedung", "", "sarpras/other"}
	for _, key := range invalid {
		if isValidPaymentItemKey(key) {
			t.Errorf("isValidPaymentItemKey(%q) = true, want false", key)
		}
	}
}

func TestValidatePaymentItemNominal(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{"integer", "125000", true},
		{"two decimal places", "125000.50", true},
		{"smallest supported fraction", "0.01", true},
		{"numeric maximum", "9999999999.99", true},
		{"zero", "0", false},
		{"negative", "-1", false},
		{"three decimal places", "1.001", false},
		{"numeric overflow", "10000000000", false},
		{"quoted number", `"125000"`, false},
		{"exponent", "1e5", false},
		{"nan", "NaN", false},
		{"positive infinity", "Infinity", false},
		{"missing", "", false},
		{"null", "null", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, got := validatePaymentItemNominal(json.RawMessage(tc.raw))
			if got != tc.want {
				t.Errorf("validatePaymentItemNominal(%q) valid = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestPaymentItemSettingsRoleBoundary(t *testing.T) {
	h := NewPaymentHandler(nil)

	for _, role := range []string{"", "guru", "santri", "pentashih"} {
		t.Run("rejects "+role, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/item-settings", nil)
			req = req.WithContext(context.WithValue(req.Context(), middleware.CtxRole, role))
			res := httptest.NewRecorder()

			h.Routes().ServeHTTP(res, req)

			if res.Code != http.StatusForbidden {
				t.Errorf("GET /item-settings as %q returned %d, want %d", role, res.Code, http.StatusForbidden)
			}
		})
	}
}

func TestPaymentItemSettingsRejectsSPPAndCustomBeforeDatabase(t *testing.T) {
	h := NewPaymentHandler(nil)

	for _, role := range []string{"admin", "superadmin", "tata_usaha"} {
		for _, key := range []string{"spp", "custom"} {
			t.Run(role+" rejects "+key, func(t *testing.T) {
				req := httptest.NewRequest(http.MethodPut, "/item-settings/"+key, nil)
				req = req.WithContext(context.WithValue(req.Context(), middleware.CtxRole, role))
				res := httptest.NewRecorder()

				h.Routes().ServeHTTP(res, req)

				if res.Code != http.StatusBadRequest {
					t.Errorf("PUT /item-settings/%s as %q returned %d, want %d", key, role, res.Code, http.StatusBadRequest)
				}
			})
		}
	}
}

func TestCashflowDateRangeUsesExclusiveNextBoundary(t *testing.T) {
	month := 2
	start, end := cashflowDateRange(2028, &month)
	if start != "2028-02-01" || end != "2028-03-01" {
		t.Fatalf("cashflowDateRange(month) = %q, %q; want 2028-02-01, 2028-03-01", start, end)
	}

	month = 12
	start, end = cashflowDateRange(2028, &month)
	if start != "2028-12-01" || end != "2029-01-01" {
		t.Fatalf("cashflowDateRange(December) = %q, %q; want 2028-12-01, 2029-01-01", start, end)
	}

	start, end = cashflowDateRange(2028, nil)
	if start != "2028-01-01" || end != "2029-01-01" {
		t.Fatalf("cashflowDateRange(year) = %q, %q; want 2028-01-01, 2029-01-01", start, end)
	}
}

func TestCashflowCustomDateRange(t *testing.T) {
	start, end, err := cashflowCustomDateRange("2028-02-29", "2028-03-01")
	if err != nil || start != "2028-02-29" || end != "2028-03-02" {
		t.Fatalf("cashflowCustomDateRange() = %q, %q, %v; want inclusive range with exclusive next day", start, end, err)
	}

	if _, _, err := cashflowCustomDateRange("2028-03-02", "2028-03-01"); err == nil {
		t.Fatal("reversed custom date range should be rejected")
	}
}

func TestNormalizeExpenseInput(t *testing.T) {
	kategori := "  Operasional  "
	deskripsi := "  Bayar listrik  "
	metode := "  Transfer  "
	catatan := "  Tagihan listrik bulan berjalan  "
	bukti := " /files/website-assets/expenses/listrik.pdf "
	got, err := normalizeExpenseInput(expenseInput{
		TanggalPengeluaran: "2026-08-09",
		Kategori:           &kategori,
		Deskripsi:          &deskripsi,
		Jumlah:             125000.125,
		MetodePembayaran:   &metode,
		Catatan:            &catatan,
		BuktiURL:           &bukti,
	})
	if err != nil {
		t.Fatalf("normalizeExpenseInput returned error: %v", err)
	}
	if got.TanggalPengeluaran != "2026-08-09" || *got.Kategori != "Operasional" || *got.Deskripsi != "Bayar listrik" || got.Jumlah != 125000.13 {
		t.Fatalf("normalized expense = %#v; want trimmed fields and rounded amount", got)
	}
	if got.MetodePembayaran == nil || *got.MetodePembayaran != "Transfer" || got.Catatan == nil || *got.Catatan != "Tagihan listrik bulan berjalan" || got.BuktiURL == nil || *got.BuktiURL != "/files/website-assets/expenses/listrik.pdf" {
		t.Fatalf("normalized detail fields = %#v; want trimmed optional values", got)
	}

	if _, err := normalizeExpenseInput(expenseInput{TanggalPengeluaran: "2026-02-31", Jumlah: 100}); err == nil {
		t.Fatal("invalid calendar date should be rejected")
	}
	invalidProof := "proof.pdf"
	if _, err := normalizeExpenseInput(expenseInput{
		TanggalPengeluaran: "2026-08-09",
		Kategori:           &kategori,
		Deskripsi:          &deskripsi,
		Jumlah:             100,
		BuktiURL:           &invalidProof,
	}); err == nil {
		t.Fatal("proof value without URL or path should be rejected")
	}
}

func TestExpenseUpdateMergePreservesUnchangedFields(t *testing.T) {
	category := "Operasional"
	description := "Bayar listrik"
	method := "Transfer"
	note := "Catatan lama"
	proof := "/files/old-proof.pdf"
	amount := 250000.0
	current := expenseRecord{
		TanggalPengeluaran: "2026-08-09",
		Kategori:           &category,
		Deskripsi:          &description,
		Jumlah:             125000,
		MetodePembayaran:   &method,
		Catatan:            &note,
		BuktiURL:           &proof,
	}
	merged := mergeExpenseUpdate(current, expenseUpdateInput{Jumlah: &amount})
	if merged.TanggalPengeluaran != current.TanggalPengeluaran || merged.Kategori != current.Kategori || merged.Deskripsi != current.Deskripsi || merged.Jumlah != amount || merged.MetodePembayaran != current.MetodePembayaran || merged.Catatan != current.Catatan || merged.BuktiURL != current.BuktiURL {
		t.Fatalf("merged expense = %#v; want only amount changed", merged)
	}
	if hasExpenseUpdateFields(expenseUpdateInput{}) {
		t.Fatal("empty partial update should not be considered a mutation")
	}
}
