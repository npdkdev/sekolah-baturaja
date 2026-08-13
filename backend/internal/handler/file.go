package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"lpq-backend/internal/config"
	"lpq-backend/internal/middleware"
	"lpq-backend/internal/storage"
)

type FileHandler struct {
	store *storage.Store
	cfg   *config.Config
}

func NewFileHandler(store *storage.Store, cfg *config.Config) *FileHandler {
	return &FileHandler{store: store, cfg: cfg}
}

func (h *FileHandler) ServePublic(w http.ResponseWriter, r *http.Request) {
	bucket, path := splitBucketPath(r.URL.Path, "/files/")
	h.store.ServeFile(w, r, bucket, path)
}

func (h *FileHandler) ServePrivate(w http.ResponseWriter, r *http.Request) {
	_, path := splitBucketPath(r.URL.Path, "/files/")
	h.store.ServeFile(w, r, storage.BucketAvatars, path)
}

func (h *FileHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	h.handleUpload(w, r, storage.BucketAvatars)
}

func (h *FileHandler) UploadAsset(w http.ResponseWriter, r *http.Request) {
	h.handleUpload(w, r, storage.BucketWebsiteAssets)
}

func (h *FileHandler) UploadMusic(w http.ResponseWriter, r *http.Request) {
	h.handleUpload(w, r, storage.BucketMusic)
}

// ownsAvatarPath reports whether the caller may write or delete the avatar at
// path. Avatar paths are "<guru|santri>/<ownerId>/profile.webp", so ownership is
// derivable from the path itself — no DB lookup needed. Admin may touch any file.
//
// The folder segment is checked against the role as well: without it a santri
// could pass "guru/<their-own-uuid>/..." and write into the guru tree. ".." is
// rejected outright so a traversal can never be read as an ownerId match.
func ownsAvatarPath(role, userID, path string) bool {
	if role == "admin" {
		return true
	}
	if role == "" || userID == "" || strings.Contains(path, "..") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if len(parts) < 2 {
		return false
	}
	folder, ownerID := parts[0], parts[1]
	switch folder {
	case "santri":
		if role != "santri" {
			return false
		}
	case "guru":
		// guru bucket covers guru, admin, and pentashih accounts.
		if role == "santri" {
			return false
		}
	default:
		return false
	}
	return ownerID == userID
}

// authorizeFileWrite gates uploads and deletes. Avatars are self-service —
// anyone may manage their own. Every other bucket stays admin-only.
func authorizeFileWrite(r *http.Request, bucket, path string) (ok bool, message string) {
	role := middleware.RoleFromCtx(r.Context())
	if bucket == storage.BucketAvatars {
		if ownsAvatarPath(role, middleware.UserIDFromCtx(r.Context()), path) {
			return true, ""
		}
		return false, "hanya pemilik atau admin yang dapat mengubah foto profil ini"
	}
	if role == "admin" {
		return true, ""
	}
	return false, "hanya admin yang dapat mengubah file ini"
}

// allowedExtensions lists, per bucket, the extensions a stored file may carry.
// Deliberately an allowlist: ".svg" is absent because SVG can carry script, and
// no document or markup type is servable from these buckets.
var allowedExtensions = map[string]map[string]bool{
	storage.BucketAvatars:       {".jpg": true, ".jpeg": true, ".png": true, ".webp": true},
	storage.BucketWebsiteAssets: {".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".pdf": true},
	storage.BucketMusic:         {".mp3": true, ".wav": true, ".ogg": true},
}

func allowedExtension(bucket, path string) bool {
	allowed, ok := allowedExtensions[bucket]
	if !ok {
		return false
	}
	return allowed[strings.ToLower(filepath.Ext(path))]
}

// canonicalMIME normalises what http.DetectContentType returns to the spellings
// the storage allowlist uses. Go reports WAV as "audio/wave" and Ogg as
// "application/ogg", neither of which matches the bucket allowlist verbatim.
//
// MP3 frames without an ID3 header sniff as "application/octet-stream"; that is
// left to fail the storage MIME check rather than being force-mapped, since the
// extension allowlist above is what keeps the served Content-Type safe.
func canonicalMIME(detected string) string {
	base := detected
	if i := strings.IndexByte(base, ';'); i >= 0 {
		base = strings.TrimSpace(base[:i])
	}
	switch base {
	case "audio/wave", "audio/x-wav":
		return "audio/wav"
	case "application/ogg", "audio/ogg":
		return "audio/ogg"
	case "audio/mp3":
		return "audio/mpeg"
	}
	return base
}

func (h *FileHandler) handleUpload(w http.ResponseWriter, r *http.Request, bucket string) {
	r.Body = http.MaxBytesReader(w, r.Body, h.cfg.MaxUploadBytes)
	if err := r.ParseMultipartForm(h.cfg.MaxUploadBytes); err != nil {
		jsonError(w, "file terlalu besar", http.StatusRequestEntityTooLarge)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file tidak ditemukan di form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	path := r.FormValue("path")
	if path == "" {
		jsonError(w, "path wajib diisi", http.StatusBadRequest)
		return
	}
	// Authorize after path is known — the path is what ownership is derived from.
	if ok, msg := authorizeFileWrite(r, bucket, path); !ok {
		jsonError(w, msg, http.StatusForbidden)
		return
	}

	// The stored extension decides the Content-Type the file is later served
	// with, so it is the control that actually matters. Uploading "x.html" into
	// website-assets — a publicly served bucket — would otherwise mean stored XSS
	// on the API origin, and ".svg" is scriptable too.
	if !allowedExtension(bucket, path) {
		jsonError(w, "ekstensi file tidak diizinkan", http.StatusUnsupportedMediaType)
		return
	}

	// Sniff the real content. The multipart part's Content-Type header is
	// attacker-supplied and was previously trusted whenever it was non-empty,
	// which let any payload through by simply claiming "image/png".
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := canonicalMIME(http.DetectContentType(buf[:n]))
	// Rewind tidak mungkin pada multipart — gabung buf dan sisa file
	combined := io.MultiReader(bytes.NewReader(buf[:n]), file)

	if err := h.store.Save(bucket, path, combined, mimeType, header.Size); err != nil {
		switch err {
		case storage.ErrInvalidPath:
			jsonError(w, "path tidak valid", http.StatusBadRequest)
		case storage.ErrInvalidMime:
			jsonError(w, "tipe file tidak diizinkan", http.StatusUnsupportedMediaType)
		case storage.ErrFileTooLarge:
			jsonError(w, "file terlalu besar", http.StatusRequestEntityTooLarge)
		default:
			jsonError(w, "gagal menyimpan file", http.StatusInternalServerError)
		}
		return
	}

	publicPath := h.store.PublicPath(bucket, path)
	jsonOK(w, map[string]string{"path": path, "url": publicPath})
}

func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	path := r.URL.Query().Get("path")
	if bucket == "" || path == "" {
		jsonError(w, "bucket dan path wajib diisi", http.StatusBadRequest)
		return
	}
	if ok, msg := authorizeFileWrite(r, bucket, path); !ok {
		jsonError(w, msg, http.StatusForbidden)
		return
	}
	if err := h.store.Delete(bucket, path); err != nil {
		jsonError(w, "gagal menghapus file", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// authorizeSignedURL gates minting. A signed URL is a bearer capability: once
// issued it works for an hour for anyone holding the link, so who may mint one
// has to be checked as carefully as who may read the file directly.
//
// Without this any logged-in santri could mint a URL for `avatars/santri/<any
// other uuid>/profile.webp` and read every child's photo — the signature check
// on the serving route was the only gate, and it happily verifies whatever was
// signed.
func authorizeSignedURL(r *http.Request, bucket, path string) (ok bool, message string) {
	role := middleware.RoleFromCtx(r.Context())
	if bucket != storage.BucketAvatars {
		// The other buckets are served unsigned anyway; refuse rather than mint a
		// capability for an arbitrary attacker-supplied bucket name.
		return false, "signed URL hanya berlaku untuk avatar"
	}
	if strings.Contains(path, "..") {
		return false, "path tidak valid"
	}
	// Staff legitimately render other people's avatars (kartu absensi, panel
	// manajemen santri). Santri may only mint for their own.
	switch role {
	case "admin", "guru", "pentashih":
		return true, ""
	case "santri":
		if ownsAvatarPath(role, middleware.UserIDFromCtx(r.Context()), path) {
			return true, ""
		}
		return false, "hanya pemilik yang dapat mengakses foto profil ini"
	}
	return false, "tidak diizinkan"
}

func (h *FileHandler) SignedURL(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	path := r.URL.Query().Get("path")
	if bucket == "" || path == "" {
		jsonError(w, "bucket dan path wajib diisi", http.StatusBadRequest)
		return
	}
	if ok, msg := authorizeSignedURL(r, bucket, path); !ok {
		jsonError(w, msg, http.StatusForbidden)
		return
	}
	baseURL := r.URL.Scheme + "://" + r.Host
	if baseURL == "://" {
		baseURL = "http://localhost:" + h.cfg.Port
	}
	url := h.store.SignedURL(bucket, path, time.Hour, baseURL)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"signed_url": url})
}

func splitBucketPath(urlPath, prefix string) (bucket, path string) {
	trimmed := strings.TrimPrefix(urlPath, prefix)
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) == 2 {
		return parts[0], filepath.Clean(parts[1])
	}
	return trimmed, ""
}
