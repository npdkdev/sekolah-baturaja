package middleware

import (
	"context"
	"net/http"
	"strings"

	"lpq-backend/internal/auth"
)

type contextKey string

const (
	CtxUserID contextKey = "user_id"
	CtxRole   contextKey = "role"
)

func RequireAuth(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			claims, err := auth.ValidateAccessToken(strings.TrimPrefix(header, "Bearer "), secret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), CtxUserID, claims.UserID)
			ctx = context.WithValue(ctx, CtxRole, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := r.Context().Value(CtxRole).(string)
			if _, ok := allowed[role]; !ok {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// StaffRoles are the roles that operate the school: everything except santri.
// Kept in one place so an authorization check cannot drift from the others.
var StaffRoles = []string{"admin", "guru", "pentashih"}

// IsStaff reports whether a role is a staff role.
func IsStaff(role string) bool {
	for _, s := range StaffRoles {
		if role == s {
			return true
		}
	}
	return false
}

func UserIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(CtxUserID).(string)
	return v
}

func RoleFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(CtxRole).(string)
	return v
}
