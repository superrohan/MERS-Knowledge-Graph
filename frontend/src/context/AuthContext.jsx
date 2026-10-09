import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import * as authApi from "../api/auth.js";
import { getStoredSession, setStoredSession } from "../api/authStorage.js";

const AuthContext = createContext(null);

/**
 * Real (not mocked) authentication state, backed by a Postgres-persisted
 * session on the server (see backend/src/services/auth.service.js).
 * Trusts a session found in localStorage optimistically on load - no
 * loading spinner gating the whole app - and only clears it once a real
 * request actually comes back 401 (see api/http.js's response
 * interceptor, which dispatches the "auth:unauthorized" event this
 * listens for).
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession());

  useEffect(() => {
    function handleUnauthorized() {
      setSession(null);
    }
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const applySession = useCallback((next) => {
    setSession(next);
    setStoredSession(next);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const result = await authApi.login({ email, password });
      applySession(result);
      return result;
    },
    [applySession],
  );

  const register = useCallback(
    async (name, email, password) => {
      const result = await authApi.register({ name, email, password });
      applySession(result);
      return result;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best-effort - clear the local session regardless of whether the
      // server call itself succeeded (it's already unusable to the user
      // either way).
    }
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      login,
      register,
      logout,
    }),
    [session, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
