package handler

import (
	"context"
	"testing"
	"time"

	"lpq-backend/internal/auth"
)

// TestIsLegacyPlaintextMatch_RejectsNomorIndukBypass pins the fix for the
// account-takeover hole in Login: the self-heal branch used to trigger whenever
// the submitted password equalled the submitted username, so typing a santri's
// nomor induk twice logged you in as them and overwrote their real password.
func TestIsLegacyPlaintextMatch_RejectsNomorIndukBypass(t *testing.T) {
	realHash, err := auth.HashPassword("rahasia-santri")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	tests := []struct {
		name     string
		role     string
		stored   string
		supplied string
		want     bool
	}{
		{
			name:     "attacker types nomor induk against a properly hashed password",
			role:     "santri",
			stored:   realHash,
			supplied: "24001", // the nomor induk, also sent as username
			want:     false,
		},
		{
			name:     "legacy plaintext row matching what was typed",
			role:     "santri",
			stored:   "24001",
			supplied: "24001",
			want:     true,
		},
		{
			name:     "legacy plaintext row, wrong password",
			role:     "santri",
			stored:   "24001",
			supplied: "24002",
			want:     false,
		},
		{
			name:     "guru rows were never imported as plaintext",
			role:     "guru",
			stored:   "admin123",
			supplied: "admin123",
			want:     false,
		},
		{
			name:     "empty stored password never authenticates",
			role:     "santri",
			stored:   "",
			supplied: "",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isLegacyPlaintextMatch(tt.role, tt.stored, tt.supplied); got != tt.want {
				t.Errorf("isLegacyPlaintextMatch(%q, %q, %q) = %v, want %v",
					tt.role, tt.stored, tt.supplied, got, tt.want)
			}
		})
	}
}

func TestIsBcryptHash(t *testing.T) {
	hashed, err := auth.HashPassword("apa saja")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !isBcryptHash(hashed) {
		t.Errorf("bcrypt output %q not recognised as a hash", hashed)
	}
	for _, plain := range []string{"", "24001", "$2", "$1$abcdefgh", "not-a-hash"} {
		if isBcryptHash(plain) {
			t.Errorf("%q wrongly recognised as a bcrypt hash", plain)
		}
	}
}

// TestDummyBcryptHashIsValid guards the timing-equalisation constant: if it ever
// stopped being a well-formed bcrypt digest, CompareHashAndPassword would fail
// immediately and the unknown-user path would go fast again, restoring the
// username-enumeration oracle.
func TestDummyBcryptHashIsValid(t *testing.T) {
	if !isBcryptHash(dummyBcryptHash) {
		t.Fatalf("dummyBcryptHash is not a bcrypt digest: %q", dummyBcryptHash)
	}
	start := time.Now()
	if err := auth.CheckPassword(dummyBcryptHash, "sembarang"); err == nil {
		t.Error("dummyBcryptHash must not match a guessable password")
	}
	// A real cost-12 comparison is tens of milliseconds. A malformed hash returns
	// in microseconds, which is the failure this catches.
	if elapsed := time.Since(start); elapsed < time.Millisecond {
		t.Errorf("comparison returned in %v — hash is not being evaluated", elapsed)
	}
}

// TestRateLimiterFailsClosed pins the behaviour that matters when the database
// is unreachable: allow() must refuse rather than wave the request through.
// A limiter that fails open would hand an attacker the brute-force ceiling back
// simply by exhausting the connection pool.
func TestRateLimiterFailsClosed(t *testing.T) {
	// A nil pool makes every query fail, standing in for a database outage.
	l := newRateLimiter(nil, "test", 10, time.Minute)

	defer func() {
		if recover() != nil {
			t.Fatal("allow() must handle a broken pool, not panic")
		}
	}()

	if l.allow(context.Background(), "1.2.3.4") {
		t.Error("allow() must return false when the counter cannot be read")
	}
}
