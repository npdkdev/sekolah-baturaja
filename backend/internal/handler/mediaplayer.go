package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// MediaPlayerHandler serves the two media-player tables defined in
// db/migrations/20260624002100_santri_legacy_fields_and_media_player.sql:
// music_files (the shared playlist) and media_player_settings (per-user playback
// state). Every column name below was read off that migration.
//
// Upload of the audio bytes is NOT here — POST /api/upload/music (file.go
// UploadMusic) already writes to the music-files bucket and returns
// {path, url}. The frontend composes the absolute file_url from that path and
// posts it to CreateMusic, so this handler only ever persists DB rows.
type MediaPlayerHandler struct {
	db *pgxpool.Pool
}

func NewMediaPlayerHandler(db *pgxpool.Pool) *MediaPlayerHandler {
	return &MediaPlayerHandler{db: db}
}

// MusicRoutes mounts at /api/music-files.
// No static child segments here, so there is nothing that /{id} could swallow.
func (h *MediaPlayerHandler) MusicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.ListMusic)
	r.Post("/", h.CreateMusic)
	r.Put("/{id}", h.UpdateMusic)
	return r
}

// SettingsRoutes mounts at /api/media-player-settings.
//
// Both verbs deliberately share the {id} param name because chi keys a path
// segment by its param name, and registering /{userId} for GET next to /{id}
// for PUT in one router invites a pattern conflict. The two verbs interpret the
// segment differently, which is dictated by the existing frontend contract in
// src/lib/mediaPlayerAdapters.js:
//
//	GET  /{id} → id is the auth USER id   (fetchOrInitMediaPlayerSettings(userId))
//	PUT  /{id} → id is the SETTINGS ROW id (syncPlaybackState / updatePlaybackPosition
//	                                        / updateShuffleEnabled all pass settingsId)
func (h *MediaPlayerHandler) SettingsRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/{id}", h.GetSettings)
	r.Put("/{id}", h.UpdateSettings)
	return r
}

// ---------------------------------------------------------------------------
// music_files
// ---------------------------------------------------------------------------

// musicFilesEditable lists the columns a client may set. Verified against the
// migration's create table public.music_files block:
//
//	title text not null
//	artist text
//	filename text
//	storage_path text
//	file_url text not null
//	is_active boolean not null default true
//
// id, created_at, updated_at, created_by and updated_by are server-owned.
var musicFilesEditable = map[string]bool{
	"title": true, "artist": true, "filename": true,
	"storage_path": true, "file_url": true, "is_active": true,
}

// musicFilesInsertable / musicFilesUpdatable extend the client whitelist with
// the audit columns this handler fills in itself.
//
// updated_at is written by hand because music_files has NO set_updated_at
// trigger — the table list in 20260624001400_audit_triggers_and_updated_at.sql
// covers 22 tables and music_files is not one of them (that migration predates
// this one). Same applies to media_player_settings below.
var musicFilesInsertable = map[string]bool{
	"title": true, "artist": true, "filename": true,
	"storage_path": true, "file_url": true, "is_active": true,
	"created_by": true, "updated_by": true,
}

var musicFilesUpdatable = map[string]bool{
	"title": true, "artist": true, "filename": true,
	"storage_path": true, "file_url": true, "is_active": true,
	"updated_at": true, "updated_by": true,
}

// ListMusic GET /api/music-files
//
// Returns only is_active rows. There is no deleted_at on this table — the
// migration's soft-delete flag is is_active, which is also why the frontend
// deactivates over PUT instead of DELETE. Mirrors the migration's
// music_files_public_read_active policy (select for anon+authenticated using
// is_active = true), so every authenticated role may read the playlist; both
// useMediaPlayer and the admin MediaPlayerSettings dialog call this one route.
func (h *MediaPlayerHandler) ListMusic(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)

	rows, err := h.db.Query(r.Context(), `
		SELECT id, title, artist, filename, storage_path, file_url,
		       is_active, created_at, updated_at, created_by, updated_by
		FROM music_files
		WHERE is_active = true
		ORDER BY created_at
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		jsonError(w, "gagal mengambil daftar musik", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca daftar musik", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// CreateMusic POST /api/music-files
//
// Records an already-uploaded file. Admin only, matching the migration's
// music_files_admin_all policy (for all using public.is_admin()).
func (h *MediaPlayerHandler) CreateMusic(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	// Both NOT NULL columns also carry a not-blank CHECK
	// (music_files_title_not_blank, music_files_file_url_not_blank). Reject here
	// so a blank value comes back as a 400 instead of a Postgres 23514.
	if isBlankField(body["title"]) {
		jsonError(w, "judul lagu wajib diisi", http.StatusBadRequest)
		return
	}
	if isBlankField(body["file_url"]) {
		jsonError(w, "file_url wajib diisi", http.StatusBadRequest)
		return
	}

	body["created_by"] = nullableUserID(r)
	body["updated_by"] = body["created_by"]

	item, err := insertRow(r.Context(), h.db, "music_files", body, musicFilesInsertable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang valid", http.StatusBadRequest)
			return
		}
		jsonError(w, "gagal menyimpan lagu: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonCreated(w, item)
}

// UpdateMusic PUT /api/music-files/{id}
//
// The only call site is deleteMusicFile, which sends {is_active: false} — the
// soft delete. Kept as a general partial update because the whitelist makes
// that free. Admin only, per music_files_admin_all.
func (h *MediaPlayerHandler) UpdateMusic(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	// Guard the not-blank CHECKs only when the column is actually being set.
	if _, ok := body["title"]; ok && isBlankField(body["title"]) {
		jsonError(w, "judul lagu tidak boleh kosong", http.StatusBadRequest)
		return
	}
	if _, ok := body["file_url"]; ok && isBlankField(body["file_url"]) {
		jsonError(w, "file_url tidak boleh kosong", http.StatusBadRequest)
		return
	}

	// Require a real client field before injecting the audit columns, otherwise
	// the always-present updated_at would keep updateRow from reporting
	// errNoFields on an empty body.
	if !hasWhitelistedField(body, musicFilesEditable) {
		jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
		return
	}
	// Overwrites any client-supplied updated_at — timestamps come from the
	// server, not the browser clock.
	body["updated_at"] = time.Now().UTC()
	body["updated_by"] = nullableUserID(r)

	item, err := updateRow(r.Context(), h.db, "music_files", id, body, musicFilesUpdatable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "lagu tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui lagu: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// ---------------------------------------------------------------------------
// media_player_settings
// ---------------------------------------------------------------------------

// settingsSelect lists every column of media_player_settings as created by the
// migration. Read through pgx.RowToMap, so nullable current_track_id needs no
// pointer scan target — RowToMap yields nil for SQL NULL.
const settingsSelect = `
	SELECT id, user_id, playback_position, is_playing, shuffle_enabled,
	       loop_enabled, crossfade_enabled, current_track_id,
	       created_at, updated_at
	FROM media_player_settings`

// GetSettings GET /api/media-player-settings/{id} where {id} is a USER id.
//
// AUTHORIZATION RULE — the identity always comes from the JWT via
// middleware.UserIDFromCtx; the path segment is only ever compared against it,
// never trusted. Chosen rule, mirroring the migration's two policies:
//
//   - caller asking for their own settings → fetch, and create the row if it is
//     missing (media_player_settings_owner_all grants the owner "for all").
//     The adapter is named fetchOrInitMediaPlayerSettings and useMediaPlayer
//     immediately stores settings.id to drive later PUTs, so a row must exist
//     by the time this returns.
//   - admin asking for someone else's → read only, never create
//     (media_player_settings_admin_select is a SELECT-only policy, so an admin
//     must not manufacture rows in another user's name).
//   - anyone else asking for someone else's → 403.
//
// A GET that can write is unusual; it is what the existing frontend contract
// requires, and the write is confined to the caller's own row.
func (h *MediaPlayerHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	callerID := middleware.UserIDFromCtx(ctx)
	if callerID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	targetID := chi.URLParam(r, "id")
	if targetID == "" {
		jsonError(w, "user id wajib diisi", http.StatusBadRequest)
		return
	}

	isSelf := targetID == callerID
	if !isSelf && middleware.RoleFromCtx(ctx) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	// Read first: this fires on every dashboard mount, and an upsert-always
	// would write a row version on each one.
	rows, err := h.db.Query(ctx, settingsSelect+" WHERE user_id = $1", targetID)
	if err != nil {
		jsonError(w, "gagal mengambil pengaturan media player", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err == nil {
		jsonData(w, item)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		jsonError(w, "gagal membaca pengaturan media player", http.StatusInternalServerError)
		return
	}

	if !isSelf {
		// Admin read-only path — do not initialise on someone else's behalf.
		jsonError(w, "pengaturan media player tidak ditemukan", http.StatusNotFound)
		return
	}

	// First load for this user. Every column except user_id has a default, so an
	// insert of user_id alone is enough. ON CONFLICT targets the migration's
	// media_player_settings_user_unique index on (user_id) and turns a
	// concurrent double-mount into a read instead of a 23505.
	insRows, err := h.db.Query(ctx, `
		INSERT INTO media_player_settings (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
		RETURNING id, user_id, playback_position, is_playing, shuffle_enabled,
		          loop_enabled, crossfade_enabled, current_track_id,
		          created_at, updated_at
	`, callerID)
	if err != nil {
		jsonError(w, "gagal menyiapkan pengaturan media player", http.StatusInternalServerError)
		return
	}
	created, err := pgx.CollectExactlyOneRow(insRows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca pengaturan media player", http.StatusInternalServerError)
		return
	}
	jsonData(w, created)
}

// UpdateSettings PUT /api/media-player-settings/{id} where {id} is the SETTINGS
// ROW id (not a user id) — that is what useMediaPlayer holds in settingsId.
//
// AUTHORIZATION RULE — because the path carries a row id, there is nothing to
// compare against the JWT subject directly, so ownership is enforced in the
// statement itself: WHERE id = $n AND user_id = $caller. A caller can never
// write another user's row, and there is no admin override, because
// media_player_settings_admin_select grants admins SELECT only. A row that
// exists but belongs to someone else returns the same 404 as a missing row, so
// the endpoint does not leak which settings ids exist.
func (h *MediaPlayerHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	callerID := middleware.UserIDFromCtx(ctx)
	if callerID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id pengaturan wajib diisi", http.StatusBadRequest)
		return
	}

	// Typed pointers rather than map[string]any: a partial update needs
	// "absent" to be distinguishable from "zero", and playback_position is an
	// integer column that a map decode would hand to pgx as float64.
	var body struct {
		PlaybackPosition *int    `json:"playback_position"`
		IsPlaying        *bool   `json:"is_playing"`
		ShuffleEnabled   *bool   `json:"shuffle_enabled"`
		LoopEnabled      *bool   `json:"loop_enabled"`
		CrossfadeEnabled *bool   `json:"crossfade_enabled"`
		CurrentTrackID   *string `json:"current_track_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	sets := []string{}
	args := []any{}
	add := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}

	if body.PlaybackPosition != nil {
		// media_player_settings_position_non_negative: check (playback_position >= 0).
		if *body.PlaybackPosition < 0 {
			jsonError(w, "playback_position tidak boleh negatif", http.StatusBadRequest)
			return
		}
		add("playback_position", *body.PlaybackPosition)
	}
	if body.IsPlaying != nil {
		add("is_playing", *body.IsPlaying)
	}
	if body.ShuffleEnabled != nil {
		add("shuffle_enabled", *body.ShuffleEnabled)
	}
	if body.LoopEnabled != nil {
		add("loop_enabled", *body.LoopEnabled)
	}
	if body.CrossfadeEnabled != nil {
		add("crossfade_enabled", *body.CrossfadeEnabled)
	}
	if body.CurrentTrackID != nil {
		// Nullable FK to music_files(id). A JSON null is indistinguishable from
		// an omitted key here, so clearing the track is not expressible — no
		// call site needs it today.
		add("current_track_id", *body.CurrentTrackID)
	}

	// playback_position is NOT NULL; a JSON null (Math.floor(NaN) serialises to
	// null) lands as a nil pointer and is skipped rather than sent as NULL. If
	// that leaves nothing to write, say so instead of running an empty UPDATE.
	if len(sets) == 0 {
		jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
		return
	}

	// Server-owned. syncPlaybackState sends its own updated_at; it is ignored
	// above (not decoded) so the browser clock never reaches the column. Needed
	// because media_player_settings has no set_updated_at trigger.
	sets = append(sets, "updated_at = now()")

	args = append(args, id, callerID)
	query := fmt.Sprintf(`
		UPDATE media_player_settings
		SET %s
		WHERE id = $%d AND user_id = $%d
		RETURNING id, user_id, playback_position, is_playing, shuffle_enabled,
		          loop_enabled, crossfade_enabled, current_track_id,
		          created_at, updated_at
	`, strings.Join(sets, ", "), len(args)-1, len(args))

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		jsonError(w, "gagal memperbarui pengaturan media player", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "pengaturan media player tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca pengaturan media player", http.StatusInternalServerError)
		return
	}
	jsonData(w, item)
}

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------

// isBlankField reports whether a decoded JSON value is missing, null, or a
// string that is empty once trimmed — the cases the not-blank CHECK
// constraints on music_files reject.
func isBlankField(v any) bool {
	if v == nil {
		return true
	}
	s, ok := v.(string)
	if !ok {
		return false
	}
	return strings.TrimSpace(s) == ""
}

// hasWhitelistedField reports whether the body carries at least one column the
// caller is allowed to set.
func hasWhitelistedField(body map[string]any, allowed map[string]bool) bool {
	for k := range body {
		if allowed[k] {
			return true
		}
	}
	return false
}
