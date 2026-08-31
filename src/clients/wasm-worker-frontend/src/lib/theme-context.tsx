"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark" | undefined;
  mounted: boolean;
  onThemeChange: (callback: (resolvedTheme: "light" | "dark") => void) => () => void;
}

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = React.useState<Theme>(defaultTheme);
  const [mounted, setMounted] = React.useState(false);
  const themeCallbacksRef = React.useRef<Set<(resolvedTheme: "light" | "dark") => void>>(new Set());

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read, client-only
    setMounted(true);
    const savedTheme = localStorage.getItem(storageKey) as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, [storageKey]);

  const resolvedTheme = React.useMemo(() => {
    if (!mounted) return undefined;

    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return theme as "light" | "dark";
  }, [theme, mounted]);

  React.useEffect(() => {
    if (!mounted || !resolvedTheme) return;

    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    
    // Notify all theme change callbacks
    themeCallbacksRef.current.forEach(callback => callback(resolvedTheme));
  }, [resolvedTheme, mounted]);

  React.useEffect(() => {
    if (mounted) {
      localStorage.setItem(storageKey, theme);
    }
  }, [theme, storageKey, mounted]);

  React.useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        const newTheme = mediaQuery.matches ? "dark" : "light";
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(newTheme);
        // Notify all theme change callbacks
        themeCallbacksRef.current.forEach(callback => callback(newTheme));
        // Trigger a re-render by updating theme state
        setTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, mounted]);

  const onThemeChange = React.useCallback((callback: (resolvedTheme: "light" | "dark") => void) => {
    themeCallbacksRef.current.add(callback);
    
    // Return cleanup function
    return () => {
      themeCallbacksRef.current.delete(callback);
    };
  }, []);

  const value = {
    theme,
    setTheme,
    resolvedTheme,
    mounted,
    onThemeChange,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = React.useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
