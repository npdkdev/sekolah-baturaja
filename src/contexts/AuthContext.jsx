import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import apiClient, { clearTokens, logout as apiLogout, restoreSession } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

const AuthContext = createContext(undefined);

// Normalise profile from /api/auth/me to match field names components expect
const normalizeUser = (data) => ({
  ...data,
  nama_lengkap: data.display_name || '',
  nama: data.display_name || '',
  nama_panggilan: data.display_name || '',
});

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const userIdRef = useRef(null);

  const clearAuthState = useCallback(() => {
    clearTokens();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
    setProfileLoading(false);
    userIdRef.current = null;
  }, []);

  const loadUserProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const data = await apiClient.get('/api/auth/me');
      const normalized = normalizeUser(data);
      setUser(normalized);
      setProfile(normalized);
      setRole(normalized.role);
      userIdRef.current = normalized.id;
      return { profile: normalized, error: null };
    } catch (error) {
      clearAuthState();
      return { profile: null, error };
    } finally {
      setProfileLoading(false);
    }
  }, [clearAuthState]);

  // Restore the session by exchanging the httpOnly refresh cookie for an access
  // token. Nothing is read from localStorage any more — the cookie is the only
  // thing that persists across a reload, and script cannot read it.
  useEffect(() => {
    const restore = async () => {
      const token = await restoreSession();
      if (!token) { setLoading(false); return; }
      try {
        const data = await apiClient.get('/api/auth/me');
        const normalized = normalizeUser(data);
        setUser(normalized);
        setProfile(normalized);
        setRole(normalized.role);
        setSession({ access_token: token });
        userIdRef.current = normalized.id;
      } catch {
        clearAuthState();
      } finally {
        setLoading(false);
      }
    };
    restore();

    // Listen for forced logout (token refresh failed in apiClient)
    const onLogout = () => clearAuthState();
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [clearAuthState]);

  const signInWithUsername = useCallback(async (rawUsername, rawPassword) => {
    try {
      const username = rawUsername.trim();
      const password = rawPassword.trim();

      // credentials: 'include' so the browser stores the httpOnly refresh cookie
      // the backend sets on a successful login.
      const res = await apiClient.authFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Username atau password salah.');

      apiClient.setTokens(json);
      setSession(json);

      const profileResult = await loadUserProfile();
      if (profileResult.error) throw profileResult.error;
      return { user: profileResult.profile, error: null };
    } catch (error) {
      return { user: null, error };
    }
  }, [loadUserProfile]);

  // signIn kept for backward compatibility (email login = same flow)
  const signIn = useCallback(async (email, password) => {
    return signInWithUsername(email, password);
  }, [signInWithUsername]);

  // signUp not used in this app (admin creates users), kept for interface parity
  const signUp = useCallback(async () => {
    return { error: new Error('Pendaftaran mandiri tidak tersedia. Hubungi administrator.') };
  }, []);

  const signOut = useCallback(async () => {
    // Ask the server to clear the refresh cookie; script cannot delete it.
    await apiLogout();
    clearAuthState();
    return { error: null };
  }, [clearAuthState]);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    role,
    loading,
    profileLoading,
    signUp,
    signIn,
    signInWithUsername,
    signOut,
    refreshProfile: loadUserProfile,
  }), [user, session, profile, role, loading, profileLoading, signUp, signIn, signInWithUsername, signOut, loadUserProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
