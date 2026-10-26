import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCsrfToken,
  loginRequest,
  registerRequest,
  getMeRequest,
  logoutRequest,
} from '../services/auth.service.js';

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} createdAt
 */

/**
 * @typedef {object} AuthContextValue
 * @property {User|null} user - Currently authenticated user, or null
 * @property {boolean} isLoading - True while session is being verified on mount
 * @property {boolean} isAuthenticated - True when user is non-null
 * @property {(params: { email: string, password: string }) => Promise<void>} login
 * @property {(params: { email: string, password: string }) => Promise<void>} register
 * @property {() => Promise<void>} logout
 */

const AuthContext = createContext(/** @type {AuthContextValue|null} */ (null));

/**
 * AuthProvider wraps the application and maintains auth state.
 * On mount it silently checks whether an existing session cookie is valid.
 * CSRF token is fetched lazily and re-fetched after login.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  /** @type {[User|null, Function]} */
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // CSRF token is held in a ref to avoid exposing it through component state
  // or any form of browser storage. It lives only in JS heap memory.
  const csrfTokenRef = useRef(/** @type {string|null} */ (null));

  /**
   * Ensures we have a valid CSRF token, fetching one from the server if not.
   * @returns {Promise<string>}
   */
  const ensureCsrfToken = useCallback(async () => {
    if (!csrfTokenRef.current) {
      csrfTokenRef.current = await fetchCsrfToken();
    }
    return csrfTokenRef.current;
  }, []);

  // On mount: verify whether a session cookie exists and is still valid.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const sessionUser = await getMeRequest();
        if (!cancelled) {
          setUser(sessionUser);
          // If authenticated, also pre-fetch CSRF token for immediate use
          if (sessionUser) {
            try {
              csrfTokenRef.current = await fetchCsrfToken();
            } catch {
              // Non-fatal: token will be fetched on next state-changing request
            }
          }
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => { cancelled = true; };
  }, []);

  /**
   * Logs in with email/password.
   * Throws ApiError on invalid credentials or server errors.
   * Caller is responsible for redirecting after success.
   *
   * @param {{ email: string, password: string }} params
   */
  const login = useCallback(async ({ email, password }) => {
    const token = await ensureCsrfToken();
    const result = await loginRequest({ email, password, csrfToken: token });
    // Server rotates the CSRF token on login; store the new one
    csrfTokenRef.current = result.csrfToken;
    setUser(result.user);
  }, [ensureCsrfToken]);

  /**
   * Registers a new user account.
   * Does NOT auto-login. Caller redirects to the login page on success.
   * Throws ApiError on duplicate email or validation errors.
   *
   * @param {{ email: string, password: string }} params
   * @returns {Promise<{ user: User }>}
   */
  const register = useCallback(async ({ email, password }) => {
    const token = await ensureCsrfToken();
    return registerRequest({ email, password, csrfToken: token });
  }, [ensureCsrfToken]);

  /**
   * Logs out the current user, destroying the server session.
   * Clears local auth state and CSRF token reference.
   */
  const logout = useCallback(async () => {
    const token = csrfTokenRef.current;
    try {
      if (token) {
        await logoutRequest(token);
      }
    } finally {
      // Clear auth state regardless of server response
      csrfTokenRef.current = null;
      setUser(null);
    }
  }, []);

  /** @type {AuthContextValue} */
  const value = {
    user,
    isLoading,
    isAuthenticated: user !== null,
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

/**
 * Custom hook providing access to the AuthContext.
 * Must be used inside an AuthProvider.
 *
 * @returns {AuthContextValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
