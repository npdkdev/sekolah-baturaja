package handler

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// rateLimiter throttles by (bucket, key) using a fixed window.
//
// Counters live in Postgres rather than in process memory. An in-memory map
// resets on every restart or redeploy — an attacker only has to wait for one —
// and is not shared, so running two instances would double every limit. The
// increment is a single atomic upsert, so concurrent requests cannot both read
// a stale count and both decide they are under the limit.
type rateLimiter struct {
	db     *pgxpool.Pool
	bucket string
	max    int
	window time.Duration
}

func newRateLimiter(db *pgxpool.Pool, bucket string, max int, window time.Duration) *rateLimiter {
	return &rateLimiter{db: db, bucket: bucket, max: max, window: window}
}

// allow records one hit and reports whether it is within the limit.
//
// On a database error it returns false — fail closed. An attacker who can break
// the database connection must not thereby remove the brute-force ceiling.
func (l *rateLimiter) allow(ctx context.Context, key string) bool {
	if l == nil || l.db == nil {
		log.Printf("rate limit %s: no database handle, denying", l.bucket)
		return false
	}
	if key == "" {
		key = "unknown"
	}
	var ok bool
	err := l.db.QueryRow(ctx,
		`SELECT consume_auth_throttle($1, $2, $3, $4)`,
		l.bucket, key, l.max, l.window,
	).Scan(&ok)
	if err != nil {
		log.Printf("rate limit %s/%s: %v", l.bucket, key, err)
		return false
	}
	return ok
}

// reset clears the window for a key, called after a successful login.
func (l *rateLimiter) reset(ctx context.Context, key string) {
	if l == nil || l.db == nil {
		return
	}
	if key == "" {
		key = "unknown"
	}
	if _, err := l.db.Exec(ctx,
		`SELECT reset_auth_throttle($1, $2)`, l.bucket, key,
	); err != nil {
		log.Printf("rate limit reset %s/%s: %v", l.bucket, key, err)
	}
}

// SweepRateLimits deletes windows that have long expired so the table cannot
// grow without bound. Runs until ctx is cancelled.
func SweepRateLimits(ctx context.Context, db *pgxpool.Pool) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := db.Exec(ctx,
				`DELETE FROM auth_throttle WHERE window_start < now() - interval '24 hours'`,
			); err != nil {
				log.Printf("rate limit sweep: %v", err)
			}
		}
	}
}
