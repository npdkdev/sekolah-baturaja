package handler

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

type PaymentHandler struct {
	db *pgxpool.Pool
}

func NewPaymentHandler(db *pgxpool.Pool) *PaymentHandler {
	return &PaymentHandler{db: db}
}

func (h *PaymentHandler) Routes() http.Handler {
	r := chi.NewRouter()

	// Payment endpoints. Static segments are registered before "/{id}" so chi
	// never reads "recap" or "expenses" as a payment id.
	r.Get("/", h.ListPayments)
	r.Get("/recap", h.PaymentRecap)
	r.Get("/cashflow", h.Cashflow)
	r.Get("/status-summary", h.PaymentStatusSummary)
	r.Get("/status/{santri_id}", h.PaymentStatus)
	r.Post("/", h.CreatePayments)
	// The UI posts batches to /batch and single records to /; both accept an
	// object or an array, so they share a handler.
	r.Post("/batch", h.CreatePayments)
	r.Post("/bulk-delete", h.BulkDeletePayments)
	r.Delete("/", h.BulkDeletePayments)
	r.Get("/{id}", h.GetPayment)
	r.Put("/{id}", h.UpdatePayment)
	r.Delete("/{id}", h.DeletePayment)

	// Expense endpoints
	r.Route("/expenses", func(r chi.Router) {
		r.Get("/", h.ListExpenses)
		r.Post("/", h.CreateExpense)
		r.Put("/{id}", h.UpdateExpense)
		r.Delete("/{id}", h.DeleteExpense)
	})

	return r
}

// paymentSelect is the shared projection for every payment read endpoint.
// santri is LEFT JOINed so a payment whose santri row was deleted still shows
// up in history and backups (the UI renders "Santri Dihapus" for those).
const paymentSelect = `
	SELECT p.id, p.santri_id, p.bulan, p.tahun, p.jumlah, p.tanggal_pembayaran::text,
	       p.metode_pembayaran, p.status, p.catatan, p.transaction_id, p.created_at::text,
	       s.nama_lengkap, s.nomor_induk_qiroati, s.kategori, s.no_hp_ortu,
	       s.jilid, s.sesi_mengaji, s.nama_ayah, s.nama_ibu, s.foto_url, s.avatar_path,
	       c.nama_kelas, c.id_guru, g.nama AS guru_nama
	FROM payments p
	LEFT JOIN santri s ON s.id = p.santri_id
	LEFT JOIN classes c ON c.id = s.current_class_id
	LEFT JOIN guru g ON g.id = c.id_guru`

// paymentRow mirrors paymentSelect. Santri columns are nullable because of the
// LEFT JOIN.
type paymentRow struct {
	ID                string  `json:"id"`
	SantriID          string  `json:"santri_id"`
	Bulan             *int    `json:"bulan"`
	Tahun             *int    `json:"tahun"`
	Jumlah            float64 `json:"jumlah"`
	TanggalPembayaran *string `json:"tanggal_pembayaran"`
	MetodePembayaran  *string `json:"metode_pembayaran"`
	Status            string  `json:"status"`
	Catatan           *string `json:"catatan"`
	TransactionID     *string `json:"transaction_id"`
	CreatedAt         string  `json:"created_at"`
	NamaLengkap       *string `json:"-"`
	NomorInduk        *string `json:"-"`
	Kategori          *string `json:"-"`
	NoHpOrtu          *string `json:"-"`
	Jilid             *string `json:"-"`
	SesiMengaji       *string `json:"-"`
	NamaAyah          *string `json:"-"`
	NamaIbu           *string `json:"-"`
	FotoURL           *string `json:"-"`
	AvatarPath        *string `json:"-"`
	NamaKelas         *string `json:"-"`
	IDGuru            *string `json:"-"`
	GuruNama          *string `json:"-"`

	// Santri is the nested object the UI reads (payment.santri.nama_lengkap),
	// rebuilt here from the flat join aliases above.
	Santri map[string]any `json:"santri"`
}

func scanPaymentRows(rows pgx.Rows) ([]paymentRow, error) {
	defer rows.Close()
	result := []paymentRow{}
	for rows.Next() {
		var p paymentRow
		if err := rows.Scan(
			&p.ID, &p.SantriID, &p.Bulan, &p.Tahun, &p.Jumlah, &p.TanggalPembayaran,
			&p.MetodePembayaran, &p.Status, &p.Catatan, &p.TransactionID, &p.CreatedAt,
			&p.NamaLengkap, &p.NomorInduk, &p.Kategori, &p.NoHpOrtu,
			&p.Jilid, &p.SesiMengaji, &p.NamaAyah, &p.NamaIbu, &p.FotoURL, &p.AvatarPath,
			&p.NamaKelas, &p.IDGuru, &p.GuruNama,
		); err != nil {
			return nil, err
		}
		if p.NamaLengkap != nil {
			var class map[string]any
			if p.NamaKelas != nil {
				class = map[string]any{
					"nama_kelas": p.NamaKelas,
					"id_guru":    p.IDGuru,
				}
				if p.GuruNama != nil {
					class["guru"] = map[string]any{"nama": p.GuruNama}
				} else {
					class["guru"] = nil
				}
			}
			p.Santri = map[string]any{
				"id":                  p.SantriID,
				"nama_lengkap":        p.NamaLengkap,
				"nomor_induk_qiroati": p.NomorInduk,
				"kategori":            p.Kategori,
				"no_hp_ortu":          p.NoHpOrtu,
				"jilid":               p.Jilid,
				"sesi_mengaji":        p.SesiMengaji,
				"nama_ayah":           p.NamaAyah,
				"nama_ibu":            p.NamaIbu,
				"foto_url":            p.FotoURL,
				"avatar_path":         p.AvatarPath,
				"class":               class,
			}
		}
		result = append(result, p)
	}
	return result, rows.Err()
}

// ListPayments GET /api/payments
// Query params: santri_id, bulan, tahun, status, search, page, limit
func (h *PaymentHandler) ListPayments(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	santriID := q.Get("santri_id")

	// A santri may only ever see their own payment rows. The filter was taken
	// straight from the query string, so any logged-in santri could omit
	// santri_id — or pass someone else's — and page through every family's
	// billing history, including the `search` filter by name. Staff roles keep
	// the unrestricted view the admin and guru panels rely on.
	if middleware.RoleFromCtx(r.Context()) == "santri" {
		santriID = middleware.UserIDFromCtx(r.Context())
		if santriID == "" {
			jsonError(w, "identitas pengguna tidak valid", http.StatusUnauthorized)
			return
		}
	}
	bulan := q.Get("bulan")
	tahun := q.Get("tahun")
	status := q.Get("status")
	search := q.Get("search")
	// transactionID groups the rows created by one checkout, which the receipt
	// page lists together.
	transactionID := q.Get("transaction_id")

	page := 1
	limit := 20
	if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	offset := (page - 1) * limit

	base := paymentSelect + ` WHERE p.deleted_at IS NULL`

	args := []any{}
	idx := 1

	if santriID != "" {
		base += fmt.Sprintf(" AND p.santri_id = $%d", idx)
		args = append(args, santriID)
		idx++
	}
	if bulan != "" {
		base += fmt.Sprintf(" AND p.bulan = $%d", idx)
		args = append(args, bulan)
		idx++
	}
	if tahun != "" {
		base += fmt.Sprintf(" AND p.tahun = $%d", idx)
		args = append(args, tahun)
		idx++
	}
	if status != "" {
		base += fmt.Sprintf(" AND p.status = $%d", idx)
		args = append(args, status)
		idx++
	}
	if transactionID != "" {
		base += fmt.Sprintf(" AND p.transaction_id = $%d", idx)
		args = append(args, transactionID)
		idx++
	}
	if search != "" {
		base += fmt.Sprintf(" AND (s.nama_lengkap ILIKE $%d OR s.nomor_induk_qiroati ILIKE $%d)", idx, idx)
		args = append(args, "%"+search+"%")
		idx++
	}

	countSQL := "SELECT COUNT(*) FROM (" + base + ") t"
	var total int
	if err := h.db.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		jsonError(w, "gagal menghitung data", http.StatusInternalServerError)
		return
	}

	base += fmt.Sprintf(" ORDER BY p.created_at DESC LIMIT $%d OFFSET $%d", idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), base, args...)
	if err != nil {
		jsonError(w, "gagal mengambil data pembayaran", http.StatusInternalServerError)
		return
	}
	result, err := scanPaymentRows(rows)
	if err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}

	// X-Total-Count is what apiClient's withMeta option reads for pagination.
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	jsonOK(w, map[string]any{
		"data":  result,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// validPaymentStatus mirrors the payments_status_check constraint in
// 20260624000700_payments_expenses_and_payment_status.sql. Anything outside this
// set is rejected by Postgres, so it is rejected here first with a clear error.
var validPaymentStatus = map[string]bool{
	"paid": true, "unpaid": true, "void": true, "refunded": true,
}

// PaymentRecap GET /api/payments/recap (admin only)
//
// Optional `year` and `month` narrow the aggregation. Without them the recap is
// all-time, which is what the dashboard summary wants; with them the caller gets
// exactly the period asked for. Because `tahun`/`bulan` are nullable (non-monthly
// items such as books leave them NULL), an equality filter deliberately excludes
// those rows — a row with no month is not part of any specific month.
func (h *PaymentHandler) PaymentRecap(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	q := r.URL.Query()
	where := []string{"deleted_at IS NULL"}
	args := []any{}

	if v := strings.TrimSpace(q.Get("year")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 2000 || n > 2100 {
			jsonError(w, "year tidak valid", http.StatusBadRequest)
			return
		}
		args = append(args, n)
		where = append(where, "tahun = $"+strconv.Itoa(len(args)))
	}
	if v := strings.TrimSpace(q.Get("month")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 12 {
			jsonError(w, "month tidak valid", http.StatusBadRequest)
			return
		}
		args = append(args, n)
		where = append(where, "bulan = $"+strconv.Itoa(len(args)))
	}

	// COALESCE keeps total_jumlah scannable as float64 even when a group sums to
	// NULL; COUNT(*) can never be NULL so it needs no guard.
	rows, err := h.db.Query(r.Context(), `
		SELECT tahun, bulan, status, COUNT(*) AS jumlah_transaksi, COALESCE(SUM(jumlah), 0) AS total_jumlah
		FROM payments
		WHERE `+strings.Join(where, " AND ")+`
		GROUP BY tahun, bulan, status
		ORDER BY tahun DESC, bulan DESC, status
	`, args...)
	if err != nil {
		jsonError(w, "gagal mengambil rekap pembayaran", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// bulan and tahun are nullable in the schema (non-monthly items like books
	// leave them NULL), so they must be scanned as pointers.
	type recapRow struct {
		Tahun           *int    `json:"tahun"`
		Bulan           *int    `json:"bulan"`
		Status          string  `json:"status"`
		JumlahTransaksi int     `json:"jumlah_transaksi"`
		TotalJumlah     float64 `json:"total_jumlah"`
	}

	result := []recapRow{}
	for rows.Next() {
		var rec recapRow
		if err := rows.Scan(&rec.Tahun, &rec.Bulan, &rec.Status, &rec.JumlahTransaksi, &rec.TotalJumlah); err != nil {
			jsonError(w, "gagal membaca rekap", http.StatusInternalServerError)
			return
		}
		result = append(result, rec)
	}

	jsonOK(w, map[string]any{"data": result})
}

// CreatePayments POST /api/payments (admin only)
// Body: single object or array of payment objects
func (h *PaymentHandler) CreatePayments(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// bulan/tahun are pointers because non-monthly items (books, uniforms) are
	// posted with null billing periods.
	type paymentInput struct {
		SantriID          string  `json:"santri_id"`
		Bulan             *int    `json:"bulan"`
		Tahun             *int    `json:"tahun"`
		Jumlah            float64 `json:"jumlah"`
		TanggalPembayaran *string `json:"tanggal_pembayaran"`
		MetodePembayaran  *string `json:"metode_pembayaran"`
		Status            string  `json:"status"`
		Catatan           *string `json:"catatan"`
		TransactionID     *string `json:"transaction_id"`
	}

	// Accept both single object and array
	var items []paymentInput
	body, err := readBody(r)
	if err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	// Try array first, then single object
	if err := json.Unmarshal(body, &items); err != nil {
		var single paymentInput
		if err2 := json.Unmarshal(body, &single); err2 != nil {
			jsonError(w, "format body tidak valid", http.StatusBadRequest)
			return
		}
		items = []paymentInput{single}
	}

	if len(items) == 0 {
		jsonError(w, "tidak ada data untuk disimpan", http.StatusBadRequest)
		return
	}

	// Status values must match the payments_status_check constraint in
	// 20260624000700_payments_expenses_and_payment_status.sql. Anything else is
	// rejected by Postgres, so reject it here with a clearer message.
	validStatus := map[string]bool{"paid": true, "unpaid": true, "void": true, "refunded": true}
	for i := range items {
		if items[i].Status == "" {
			items[i].Status = "paid"
		}
		item := items[i]
		if item.SantriID == "" {
			jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
			return
		}
		// bulan/tahun are nullable: non-monthly items (books, uniforms) carry no
		// billing period. Validate only when a value is supplied.
		if item.Bulan != nil && (*item.Bulan < 1 || *item.Bulan > 12) {
			jsonError(w, "bulan tidak valid", http.StatusBadRequest)
			return
		}
		if item.Tahun != nil && (*item.Tahun < 2000 || *item.Tahun > 2100) {
			jsonError(w, "tahun tidak valid", http.StatusBadRequest)
			return
		}
		if item.Jumlah < 0 {
			jsonError(w, "jumlah tidak boleh negatif", http.StatusBadRequest)
			return
		}
		if item.TanggalPembayaran == nil || *item.TanggalPembayaran == "" {
			jsonError(w, "tanggal_pembayaran wajib diisi", http.StatusBadRequest)
			return
		}
		if !validStatus[item.Status] {
			jsonError(w, "status tidak valid: "+item.Status, http.StatusBadRequest)
			return
		}
	}

	// A cart checkout is one logical transaction: if any row violates the
	// per-period unique index, none should be committed.
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	callerID := middleware.UserIDFromCtx(r.Context())
	var createdBy *string
	if callerID != "" {
		createdBy = &callerID
	}

	// The UI reads data[0].id from the response, so return whole rows.
	inserted := []map[string]any{}
	for _, item := range items {
		var id string
		var createdAt string
		err := tx.QueryRow(r.Context(), `
			INSERT INTO payments
				(santri_id, bulan, tahun, jumlah, tanggal_pembayaran, metode_pembayaran,
				 status, catatan, transaction_id, created_by, updated_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
			RETURNING id, created_at
		`, item.SantriID, item.Bulan, item.Tahun, item.Jumlah,
			item.TanggalPembayaran, item.MetodePembayaran, item.Status,
			item.Catatan, item.TransactionID, createdBy,
		).Scan(&id, &createdAt)
		if err != nil {
			jsonServerError(w, "gagal menyimpan pembayaran", err)
			return
		}
		inserted = append(inserted, map[string]any{
			"id":                 id,
			"santri_id":          item.SantriID,
			"bulan":              item.Bulan,
			"tahun":              item.Tahun,
			"jumlah":             item.Jumlah,
			"tanggal_pembayaran": item.TanggalPembayaran,
			"metode_pembayaran":  item.MetodePembayaran,
			"status":             item.Status,
			"catatan":            item.Catatan,
			"transaction_id":     item.TransactionID,
			"created_at":         createdAt,
		})
	}

	if err := tx.Commit(r.Context()); err != nil {
		jsonServerError(w, "gagal menyimpan pembayaran", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": inserted})
}

// DeletePayment DELETE /api/payments/:id (admin only)
func (h *PaymentHandler) DeletePayment(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	// Soft delete: payments_active_santri_bulan_tahun_unique is a partial index
	// on "deleted_at IS NULL", so the schema is built around soft deletes and all
	// read paths filter on it.
	tag, err := h.db.Exec(r.Context(), `
		UPDATE payments SET deleted_at = now(), updated_by = $2
		WHERE id = $1 AND deleted_at IS NULL
	`, id, nullableUserID(r))
	if err != nil {
		jsonError(w, "gagal menghapus pembayaran", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pembayaran tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// BulkDeletePayments DELETE /api/payments (admin only)
// Body: {ids: [uuid...]}
func (h *PaymentHandler) BulkDeletePayments(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.IDs) == 0 {
		jsonError(w, "ids wajib diisi", http.StatusBadRequest)
		return
	}

	// Build $1,$2,... placeholders
	placeholders := make([]string, len(body.IDs))
	args := make([]any, len(body.IDs))
	for i, id := range body.IDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	// Soft delete, to match DeletePayment and the partial unique index.
	args = append(args, nullableUserID(r))
	query := fmt.Sprintf(
		"UPDATE payments SET deleted_at = now(), updated_by = $%d WHERE id IN (%s) AND deleted_at IS NULL",
		len(args), strings.Join(placeholders, ","))
	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal menghapus pembayaran", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]any{"deleted": tag.RowsAffected()}})
}

// PaymentStatus GET /api/payments/status/:santri_id
func (h *PaymentHandler) PaymentStatus(w http.ResponseWriter, r *http.Request) {
	santriID := chi.URLParam(r, "santri_id")
	if santriID == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}

	// Only allow own data unless admin/guru
	role := middleware.RoleFromCtx(r.Context())
	callerID := middleware.UserIDFromCtx(r.Context())
	if role == "santri" && callerID != santriID {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// Reuses paymentSelect so the santri history screens get the same shape as
	// /api/payments (including the nested santri object).
	rows, err := h.db.Query(r.Context(),
		paymentSelect+` WHERE p.deleted_at IS NULL AND p.santri_id = $1
		ORDER BY p.tanggal_pembayaran DESC NULLS LAST, p.created_at DESC`, santriID)
	if err != nil {
		jsonError(w, "gagal mengambil status pembayaran", http.StatusInternalServerError)
		return
	}

	result, err := scanPaymentRows(rows)
	if err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}

	jsonData(w, result)
}

// ListExpenses GET /api/payments/expenses (admin only)
// Query params: from (date), to (date), page, limit
func (h *PaymentHandler) ListExpenses(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	q := r.URL.Query()
	// Accept both spellings: the finance screens send date_from/date_to.
	from := q.Get("date_from")
	if from == "" {
		from = q.Get("from")
	}
	to := q.Get("date_to")
	if to == "" {
		to = q.Get("to")
	}
	page := 1
	limit := 200
	if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	offset := (page - 1) * limit

	// Column names verified against 20260624000700_payments_expenses_and_payment_status.sql:
	// the table has tanggal_pengeluaran and deskripsi (not tanggal/keterangan).
	// Date and timestamp columns are cast to text: pgx v5 refuses to scan
	// date/timestamptz into *string, and these are read into string fields.
	// WHERE still filters the real date column, so range comparisons stay typed.
	base := `SELECT id, tanggal_pengeluaran::text, kategori, deskripsi, jumlah, bukti_url,
	                created_by, created_at::text, updated_at::text, deleted_at::text
	         FROM expenses WHERE deleted_at IS NULL`
	args := []any{}
	idx := 1

	if from != "" {
		base += fmt.Sprintf(" AND tanggal_pengeluaran >= $%d", idx)
		args = append(args, from)
		idx++
	}
	if to != "" {
		base += fmt.Sprintf(" AND tanggal_pengeluaran <= $%d", idx)
		args = append(args, to)
		idx++
	}

	countSQL := "SELECT COUNT(*) FROM (" + base + ") t"
	var total int
	if err := h.db.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		jsonError(w, "gagal menghitung data", http.StatusInternalServerError)
		return
	}

	base += fmt.Sprintf(" ORDER BY tanggal_pengeluaran DESC, created_at DESC LIMIT $%d OFFSET $%d", idx, idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), base, args...)
	if err != nil {
		jsonError(w, "gagal mengambil data pengeluaran", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type expenseRow struct {
		TanggalPengeluaran string  `json:"tanggal_pengeluaran"`
		ID                 string  `json:"id"`
		Kategori           *string `json:"kategori"`
		Deskripsi          *string `json:"deskripsi"`
		Jumlah             float64 `json:"jumlah"`
		BuktiURL           *string `json:"bukti_url"`
		CreatedBy          *string `json:"created_by"`
		CreatedAt          string  `json:"created_at"`
		UpdatedAt          string  `json:"updated_at"`
		DeletedAt          *string `json:"deleted_at"`
	}

	result := []expenseRow{}
	for rows.Next() {
		var e expenseRow
		if err := rows.Scan(&e.ID, &e.TanggalPengeluaran, &e.Kategori, &e.Deskripsi,
			&e.Jumlah, &e.BuktiURL, &e.CreatedBy, &e.CreatedAt, &e.UpdatedAt, &e.DeletedAt); err != nil {
			jsonError(w, "gagal membaca data", http.StatusInternalServerError)
			return
		}
		result = append(result, e)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	jsonData(w, result)
}

// CreateExpense POST /api/payments/expenses (admin only)
func (h *PaymentHandler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body expenseInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.TanggalPengeluaran == "" || body.Jumlah <= 0 {
		jsonError(w, "tanggal pengeluaran dan jumlah wajib diisi", http.StatusBadRequest)
		return
	}

	callerID := nullableUserID(r)

	var id string
	var createdAt string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO expenses (tanggal_pengeluaran, kategori, deskripsi, jumlah, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$5)
		RETURNING id, created_at
	`, body.TanggalPengeluaran, body.Kategori, body.Deskripsi, body.Jumlah, callerID).Scan(&id, &createdAt)
	if err != nil {
		jsonServerError(w, "gagal menyimpan pengeluaran", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{
		"id":                  id,
		"tanggal_pengeluaran": body.TanggalPengeluaran,
		"kategori":            body.Kategori,
		"deskripsi":           body.Deskripsi,
		"jumlah":              body.Jumlah,
		"created_at":          createdAt,
	}})
}

// expenseInput is shared by CreateExpense and UpdateExpense. Field names match
// the expenses table columns.
type expenseInput struct {
	TanggalPengeluaran string  `json:"tanggal_pengeluaran"`
	Kategori           *string `json:"kategori"`
	Deskripsi          *string `json:"deskripsi"`
	Jumlah             float64 `json:"jumlah"`
}

// UpdateExpense PUT /api/payments/expenses/:id (admin only)
func (h *PaymentHandler) UpdateExpense(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body expenseInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.TanggalPengeluaran == "" || body.Jumlah <= 0 {
		jsonError(w, "tanggal pengeluaran dan jumlah wajib diisi", http.StatusBadRequest)
		return
	}

	tag, err := h.db.Exec(r.Context(), `
		UPDATE expenses
		SET tanggal_pengeluaran = $2, kategori = $3, deskripsi = $4, jumlah = $5, updated_by = $6
		WHERE id = $1 AND deleted_at IS NULL
	`, id, body.TanggalPengeluaran, body.Kategori, body.Deskripsi, body.Jumlah, nullableUserID(r))
	if err != nil {
		jsonServerError(w, "gagal memperbarui pengeluaran", err)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pengeluaran tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonData(w, map[string]any{
		"id":                  id,
		"tanggal_pengeluaran": body.TanggalPengeluaran,
		"kategori":            body.Kategori,
		"deskripsi":           body.Deskripsi,
		"jumlah":              body.Jumlah,
	})
}

// DeleteExpense DELETE /api/payments/expenses/:id (admin only)
func (h *PaymentHandler) DeleteExpense(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	// Soft delete: the UI's expense list filters on deleted_at IS NULL.
	tag, err := h.db.Exec(r.Context(), `
		UPDATE expenses SET deleted_at = now(), updated_by = $2
		WHERE id = $1 AND deleted_at IS NULL
	`, id, nullableUserID(r))
	if err != nil {
		jsonError(w, "gagal menghapus pengeluaran", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pengeluaran tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// nullableUserID returns the caller's id, or nil when there is none, so the
// created_by/updated_by FKs to auth_users get NULL instead of an empty string.
func nullableUserID(r *http.Request) any {
	if id := middleware.UserIDFromCtx(r.Context()); id != "" {
		return id
	}
	return nil
}

// GetPayment GET /api/payments/{id}
// Returns one payment with the nested santri object. Used by the payment proof
// modal and the public-facing receipt page.
func (h *PaymentHandler) GetPayment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(r.Context(),
		paymentSelect+" WHERE p.id = $1 AND p.deleted_at IS NULL", id)
	if err != nil {
		jsonError(w, "gagal mengambil data pembayaran", http.StatusInternalServerError)
		return
	}
	list, err := scanPaymentRows(rows)
	if err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}
	if len(list) == 0 {
		jsonError(w, "pembayaran tidak ditemukan", http.StatusNotFound)
		return
	}

	// Santri may only read their own receipt.
	if middleware.RoleFromCtx(r.Context()) == "santri" &&
		middleware.UserIDFromCtx(r.Context()) != list[0].SantriID {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	jsonData(w, list[0])
}

// UpdatePayment PUT /api/payments/{id} (admin only)
// Partial update: only the keys present in the body are written.
func (h *PaymentHandler) UpdatePayment(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	// Whitelist of updatable columns — never interpolate a caller-supplied key
	// into SQL.
	allowed := map[string]bool{
		"bulan": true, "tahun": true, "jumlah": true, "tanggal_pembayaran": true,
		"metode_pembayaran": true, "status": true, "catatan": true,
	}
	validStatus := map[string]bool{"paid": true, "unpaid": true, "void": true, "refunded": true}

	sets := []string{}
	args := []any{id}
	for key, val := range body {
		if !allowed[key] {
			continue
		}
		if key == "status" {
			s, ok := val.(string)
			if !ok || !validStatus[s] {
				jsonError(w, "status tidak valid", http.StatusBadRequest)
				return
			}
		}
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", key, len(args)))
	}
	if len(sets) == 0 {
		jsonError(w, "tidak ada field yang diperbarui", http.StatusBadRequest)
		return
	}
	args = append(args, nullableUserID(r))
	sets = append(sets, fmt.Sprintf("updated_by = $%d", len(args)))

	query := fmt.Sprintf(
		"UPDATE payments SET %s WHERE id = $1 AND deleted_at IS NULL",
		strings.Join(sets, ", "))
	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonServerError(w, "gagal memperbarui pembayaran", err)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pembayaran tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonData(w, map[string]string{"id": id})
}

// PaymentStatusSummary GET /api/payments/status-summary?bulan=&tahun=
// Returns one row per active santri with "Lunas" / "Belum Lunas" for the given
// period, mirroring the payment_status_summary view. Admin and guru only —
// guru is allowed because the view exists precisely so teachers can see paid
// status without reading payment amounts.
func (h *PaymentHandler) PaymentStatusSummary(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" && role != "guru" && role != "pentashih" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	bulan := r.URL.Query().Get("bulan")
	tahun := r.URL.Query().Get("tahun")
	if bulan == "" || tahun == "" {
		jsonError(w, "bulan dan tahun wajib diisi", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT s.id AS santri_id,
		       CASE WHEN EXISTS (
		         SELECT 1 FROM payments p
		         WHERE p.santri_id = s.id
		           AND p.bulan = $1 AND p.tahun = $2
		           AND p.status = 'paid' AND p.deleted_at IS NULL
		       ) THEN 'Lunas' ELSE 'Belum Lunas' END AS status
		FROM santri s
		WHERE s.deleted_at IS NULL
		  AND (s.status IS NULL OR s.status ILIKE 'aktif' OR s.status ILIKE 'active')
	`, bulan, tahun)
	if err != nil {
		jsonError(w, "gagal mengambil status pembayaran", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type summaryRow struct {
		SantriID string `json:"santri_id"`
		Status   string `json:"status"`
	}
	result := []summaryRow{}
	for rows.Next() {
		var s summaryRow
		if err := rows.Scan(&s.SantriID, &s.Status); err != nil {
			jsonError(w, "gagal membaca data", http.StatusInternalServerError)
			return
		}
		result = append(result, s)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}

	jsonData(w, result)
}

// Cashflow GET /api/payments/cashflow?year=&month=  (admin only)
// month is omitted or "all" for a whole-year total. Sums are computed in
// Postgres so the client never has to page through every row.
func (h *PaymentHandler) Cashflow(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	year, err := strconv.Atoi(r.URL.Query().Get("year"))
	if err != nil {
		jsonError(w, "year tidak valid", http.StatusBadRequest)
		return
	}
	monthParam := r.URL.Query().Get("month")
	var month *int
	if monthParam != "" && monthParam != "all" {
		m, err := strconv.Atoi(monthParam)
		if err != nil || m < 1 || m > 12 {
			jsonError(w, "month tidak valid", http.StatusBadRequest)
			return
		}
		month = &m
	}

	// Income is keyed on the billing period (bulan/tahun); expenses are keyed on
	// the calendar date, so the two use different filters for the same period.
	var totalIn float64
	var countIn int
	if err := h.db.QueryRow(r.Context(), `
		SELECT COALESCE(SUM(jumlah), 0), COUNT(*)
		FROM payments
		WHERE tahun = $1 AND status = 'paid' AND deleted_at IS NULL
		  AND ($2::int IS NULL OR bulan = $2::int)
	`, year, month).Scan(&totalIn, &countIn); err != nil {
		jsonError(w, "gagal menghitung pemasukan", http.StatusInternalServerError)
		return
	}

	startDate := fmt.Sprintf("%04d-01-01", year)
	endDate := fmt.Sprintf("%04d-12-31", year)
	if month != nil {
		startDate = fmt.Sprintf("%04d-%02d-01", year, *month)
		// The first of the next month minus a day, computed by Postgres to avoid
		// month-length and leap-year edge cases.
		endDate = ""
	}

	var totalOut float64
	var countOut int
	expenseSQL := `
		SELECT COALESCE(SUM(jumlah), 0), COUNT(*)
		FROM expenses
		WHERE deleted_at IS NULL
		  AND tanggal_pengeluaran >= $1::date
		  AND tanggal_pengeluaran <= $2::date`
	var expenseArgs []any
	if endDate == "" {
		expenseSQL = `
			SELECT COALESCE(SUM(jumlah), 0), COUNT(*)
			FROM expenses
			WHERE deleted_at IS NULL
			  AND tanggal_pengeluaran >= $1::date
			  AND tanggal_pengeluaran < ($1::date + interval '1 month')`
		expenseArgs = []any{startDate}
	} else {
		expenseArgs = []any{startDate, endDate}
	}
	if err := h.db.QueryRow(r.Context(), expenseSQL, expenseArgs...).Scan(&totalOut, &countOut); err != nil {
		jsonError(w, "gagal menghitung pengeluaran", http.StatusInternalServerError)
		return
	}

	// Round to cents to match the numeric(12,2) columns.
	round2 := func(v float64) float64 { return math.Round(v*100) / 100 }

	jsonData(w, map[string]any{
		"totalPemasukan":   round2(totalIn),
		"totalPengeluaran": round2(totalOut),
		"saldoBersih":      round2(totalIn - totalOut),
		"paymentCount":     countIn,
		"expenseCount":     countOut,
	})
}
