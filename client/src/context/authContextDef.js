import { createContext } from "react";

/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} createdAt
 */

/**
 * @typedef {object} AuthContextValue
 * @property {User|null} user - Currently authenticated user, or null
 * @property {boolean} isLoading - True while session is being verified on mount / retry
 * @property {boolean} isAuthenticated - True when user is non-null
 * @property {string|null} sessionError - Non-null when session check failed due to a network/server error
 * @property {() => void} retrySessionCheck - Re-runs the session restoration check
 * @property {(params: { email: string, password: string }) => Promise<void>} login
 * @property {(params: { email: string, password: string }) => Promise<void>} register
 * @property {() => Promise<void>} logout
 */

/**
 * AuthContext - internal React context for authentication state.
 * Consume via the useAuth hook (useAuth.js); do not use directly.
 * @type {import("react").Context<AuthContextValue|null>}
 */
export const AuthContext = createContext(/** @type {AuthContextValue|null} */ (null));
