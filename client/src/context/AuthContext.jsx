import { useState, useEffect, useCallback, useRef } from "react";
import { AuthContext } from "./authContextDef.js";
import {
  fetchCsrfToken,
  loginRequest,
  registerRequest,
  getMeRequest,
  logoutRequest,
} from "../services/auth.service.js";

/**
 * AuthProvider wraps the application and maintains authentication state.
 * On mount it silently checks whether an existing session cookie is valid.
 * CSRF token is fetched lazily and re-fetched after login.
 *
 * State machine:
 *   - isLoading=true, user=null, sessionError=null  => checking session
 *   - isLoading=false, user={...}, sessionError=null => authenticated
 *   - isLoading=false, user=null, sessionError=null  => unauthenticated (clean 401)
 *   - isLoading=false, user=null, sessionError=msg   => network/server error; Retry available
 *
 * @param {{ children: import("react").ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  // CSRF token held in a ref: never in state, localStorage, or sessionStorage.
  const csrfTokenRef = useRef(null);

  // Generation counter: bumped on logout to invalidate any concurrent /me response.
  const sessionGenRef = useRef(0);

  // Trigger counter: incrementing causes the session-check effect to re-run.
  const [checkTrigger, setCheckTrigger] = useState(0);

  const ensureCsrfToken = useCallback(async () => {
    if (!csrfTokenRef.current) {
      csrfTokenRef.current = await fetchCsrfToken();
    }
    return csrfTokenRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const gen = sessionGenRef.current;

    setIsLoading(true);
    setSessionError(null);

    async function restoreSession() {
      try {
        const sessionUser = await getMeRequest();
        if (cancelled || gen !== sessionGenRef.current) return;
        setUser(sessionUser);
        setSessionError(null);
        if (sessionUser) {
          try { csrfTokenRef.current = await fetchCsrfToken(); } catch { /* non-fatal */ }
        }
      } catch (err) {
        if (cancelled || gen !== sessionGenRef.current) return;
        // getMeRequest only throws on non-401 errors (network failure, 5xx).
        // A clean 401 returns null; no throw.
        setUser(null);
        setSessionError(err?.message || "Could not connect to the server. Check your connection.");
      } finally {
        if (!cancelled && gen === sessionGenRef.current) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, [checkTrigger]);

  const retrySessionCheck = useCallback(() => {
    setCheckTrigger((c) => c + 1);
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const token = await ensureCsrfToken();
    const result = await loginRequest({ email, password, csrfToken: token });
    csrfTokenRef.current = result.csrfToken;
    setUser(result.user);
    setSessionError(null);
  }, [ensureCsrfToken]);

  const register = useCallback(async ({ email, password }) => {
    const token = await ensureCsrfToken();
    return registerRequest({ email, password, csrfToken: token });
  }, [ensureCsrfToken]);

  /**
   * Logout: bumps generation immediately to guard stale /me responses,
   * then awaits server confirmation before clearing local state.
   * Throws on server failure so the caller can display an honest error.
   */
  const logout = useCallback(async () => {
    sessionGenRef.current += 1;
    const token = csrfTokenRef.current;
    if (token) {
      await logoutRequest(token); // may throw - caller must handle
    }
    csrfTokenRef.current = null;
    setUser(null);
    setSessionError(null);
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    sessionError,
    retrySessionCheck,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
