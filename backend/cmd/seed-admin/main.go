package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 4 {
		fmt.Fprintln(os.Stderr, "Usage: seed-admin <db-url> <email> <password>")
		os.Exit(1)
	}
	dbURL, email, password := os.Args[1], os.Args[2], os.Args[3]

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatalf("hash: %v", err)
	}

	// Insert into auth_users stub first (FK target)
	var adminID string
	err = pool.QueryRow(context.Background(), `
		INSERT INTO auth_users (email) VALUES ($1)
		ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
		RETURNING id
	`, email).Scan(&adminID)
	if err != nil {
		log.Fatalf("auth_users: %v", err)
	}

	// Insert/update guru
	_, err = pool.Exec(context.Background(), `
		INSERT INTO guru (id, nama, email, password, status, roles)
		VALUES ($1, 'Admin', $2, $3, 'active', ARRAY['admin'])
		ON CONFLICT (id) DO UPDATE SET
			email    = EXCLUDED.email,
			password = EXCLUDED.password,
			status   = 'active'
	`, adminID, email, string(hash))
	if err != nil {
		log.Fatalf("guru: %v", err)
	}

	// Insert/update user_profiles
	_, err = pool.Exec(context.Background(), `
		INSERT INTO user_profiles (id, user_id, role, display_name, email, status)
		VALUES (gen_random_uuid(), $1, 'admin', 'Admin', $2, 'active')
		ON CONFLICT (user_id) DO UPDATE SET
			role   = 'admin',
			status = 'active'
	`, adminID, email)
	if err != nil {
		log.Fatalf("user_profiles: %v", err)
	}

	fmt.Printf("Admin created: %s (id: %s)\n", email, adminID)
}
