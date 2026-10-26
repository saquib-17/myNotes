/**
 * Authentication API service.
 * All state-changing requests include the current CSRF token in the
 * X-Csrf-Token header. Credentials (cookies) are sent via credentials:'include'.
 * Tokens are NEVER stored in localStorage or sessionStorage.
 */

const API_BASE = '/api/auth';

/**
 * Fetches a fresh CSRF token from the server, establishing an anonymous
 * session if one does not yet exist.
 *
 * @returns {Promise<string>} The CSRF token string
 * @throws {Error} If the request fails or the response is malformed
 */
export async function fetchCsrfToken() {
  const response = await fetch(`${API_BASE}/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token (HTTP ${response.status})`);
  }

  const data = await response.json();
  if (!data?.csrfToken || typeof data.csrfToken !== 'string') {
    throw new Error('Malformed CSRF token response from server.');
  }

  return data.csrfToken;
}

/**
 * Authenticates a user with email and password.
 * On success the server sets the session cookie and returns a refreshed CSRF token.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.csrfToken - Current session-bound CSRF token
 * @returns {Promise<{ user: { id: string, email: string, createdAt: string }, csrfToken: string }>}
 */
export async function loginRequest({ email, password, csrfToken }) {
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Login failed (HTTP ${response.status})`,
      response.status,
      data?.error
    );
  }

  return data;
}

/**
 * Registers a new user account.
 * Does NOT auto-login per Stage 3A design; caller must redirect to login.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.csrfToken - Current session-bound CSRF token
 * @returns {Promise<{ user: { id: string, email: string, createdAt: string } }>}
 */
export async function registerRequest({ email, password, csrfToken }) {
  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Registration failed (HTTP ${response.status})`,
      response.status,
      data?.error
    );
  }

  return data;
}

/**
 * Fetches the current authenticated user profile.
 * Returns null if the user is not authenticated (401).
 *
 * @returns {Promise<{ id: string, email: string, createdAt: string } | null>}
 */
export async function getMeRequest() {
  const response = await fetch(`${API_BASE}/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch session user (HTTP ${response.status})`);
  }

  const data = await response.json();
  return data?.user ?? null;
}

/**
 * Logs out the current user by destroying the server-side session.
 *
 * @param {string} csrfToken - Current session-bound CSRF token
 * @returns {Promise<void>}
 */
export async function logoutRequest(csrfToken) {
  const response = await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-Csrf-Token': csrfToken,
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Logout failed (HTTP ${response.status})`);
  }
}

/**
 * Typed error from an API response with HTTP status and error code.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status - HTTP status code
   * @param {string} [code] - Server error code string (e.g. 'Conflict')
   */
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
