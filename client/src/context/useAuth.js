import { useContext } from "react";
import { AuthContext } from "./authContextDef.js";

/**
 * Custom hook providing access to the authentication context.
 * Must be used inside an AuthProvider.
 *
 * @returns {import("./authContextDef.js").AuthContextValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
