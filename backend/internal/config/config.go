package config

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port             string
	DatabaseURL      string
	JWTSecret        string
	JWTRefreshSecret string
	AccessTokenTTL   int // minutes
	RefreshTokenTTL  int // days
	UploadDir        string
	// StaticDir holds the built frontend. Empty or missing means API-only,
	// which is the development setup where Vite serves the app.
	StaticDir      string
	MaxUploadBytes int64
	// CookieSecure marks the refresh cookie Secure so it is only ever sent over
	// HTTPS. Defaults to true; set COOKIE_SECURE=false only for plain-http local
	// development, never in production.
	CookieSecure bool
}

// minSecretLen is the shortest JWT secret accepted. HS256 keys shorter than the
// 256-bit hash output weaken the MAC and are brute-forcible offline from any
// single captured token.
const minSecretLen = 32

func Load() (*Config, error) {
	cfg := &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      mustEnv("DATABASE_URL"),
		JWTSecret:        mustEnv("JWT_SECRET"),
		JWTRefreshSecret: mustEnv("JWT_REFRESH_SECRET"),
		AccessTokenTTL:   getEnvInt("ACCESS_TOKEN_TTL_MINUTES", 15),
		RefreshTokenTTL:  getEnvInt("REFRESH_TOKEN_TTL_DAYS", 30),
		UploadDir:        getEnv("UPLOAD_DIR", "/app/uploads"),
		StaticDir:        getEnv("STATIC_DIR", "/app/web"),
		MaxUploadBytes:   int64(getEnvInt("MAX_UPLOAD_MB", 20)) * 1024 * 1024,
		CookieSecure:     getEnv("COOKIE_SECURE", "true") != "false",
	}

	// Fail closed at startup rather than serving forgeable tokens. SETUP.md
	// already documents "min 32 karakter acak" for both, but nothing enforced it.
	if len(cfg.JWTSecret) < minSecretLen {
		return nil, fmt.Errorf("JWT_SECRET terlalu pendek: minimal %d karakter", minSecretLen)
	}
	if len(cfg.JWTRefreshSecret) < minSecretLen {
		return nil, fmt.Errorf("JWT_REFRESH_SECRET terlalu pendek: minimal %d karakter", minSecretLen)
	}
	// Identical secrets collapse the access/refresh split: a refresh token would
	// verify wherever an access token is expected, and only the "type" claim
	// would stand between a 30-day token and API access.
	if cfg.JWTSecret == cfg.JWTRefreshSecret {
		return nil, fmt.Errorf("JWT_SECRET dan JWT_REFRESH_SECRET harus berbeda")
	}

	return cfg, nil
}

// FileSignKey derives the HMAC key for signed file URLs from the JWT secret
// instead of reusing it verbatim. Domain separation: a weakness or leak in one
// signing context must not transfer to the other.
func (c *Config) FileSignKey() string {
	m := hmac.New(sha256.New, []byte(c.JWTSecret))
	m.Write([]byte("lpq:file-signing:v1"))
	return hex.EncodeToString(m.Sum(nil))
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s not set", key))
	}
	return v
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
