import { useEffect, useMemo } from "react";
import { ThemeContext } from "./themeContextDef.js";

const THEME_STORAGE_KEY = "mynotes.theme";

/**
 * Single Light Theme Provider.
 * Enforces the carefully designed single light theme across MyNotes.
 * Permanently removes any legacy dark mode flags and classes.
 */
export function ThemeProvider({ children }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
    try {
      window.localStorage?.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const value = useMemo(
    () => ({
      theme: "light",
      isDark: false,
      toggleTheme: () => {},
      setTheme: () => {},
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

