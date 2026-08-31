"use client";

import * as React from "react";

// The Worker's API base URL and the ledger ID are both runtime-configurable from the UI (not
// build-time env vars) — this frontend is meant to point at whichever `TigerBeetleLedger`
// deployment (celld dev, wrangler dev, or a deployed Worker) the user is running against.

const STORAGE_KEY = "dt-bank:ledger-settings";
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_LEDGER_API_BASE ?? "http://localhost:9876";
const DEFAULT_LEDGER_ID = "default";

interface LedgerSettings {
  baseUrl: string;
  ledgerId: string;
}

interface LedgerSettingsContextValue extends LedgerSettings {
  setBaseUrl: (baseUrl: string) => void;
  setLedgerId: (ledgerId: string) => void;
}

const LedgerSettingsContext = React.createContext<
  LedgerSettingsContextValue | undefined
>(undefined);

function readStoredSettings(): LedgerSettings {
  if (typeof window === "undefined") {
    return { baseUrl: DEFAULT_BASE_URL, ledgerId: DEFAULT_LEDGER_ID };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { baseUrl: DEFAULT_BASE_URL, ledgerId: DEFAULT_LEDGER_ID };
    const parsed = JSON.parse(raw);
    return {
      baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL,
      ledgerId: parsed.ledgerId ?? DEFAULT_LEDGER_ID,
    };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, ledgerId: DEFAULT_LEDGER_ID };
  }
}

export function LedgerSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = React.useState<LedgerSettings>({
    baseUrl: DEFAULT_BASE_URL,
    ledgerId: DEFAULT_LEDGER_ID,
  });

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read, client-only
    setSettings(readStoredSettings());
  }, []);

  const persist = React.useCallback((next: LedgerSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort only — a private-browsing tab throwing here shouldn't break the UI.
    }
  }, []);

  const value = React.useMemo<LedgerSettingsContextValue>(
    () => ({
      ...settings,
      setBaseUrl: (baseUrl) => persist({ ...settings, baseUrl }),
      setLedgerId: (ledgerId) => persist({ ...settings, ledgerId }),
    }),
    [settings, persist],
  );

  return (
    <LedgerSettingsContext.Provider value={value}>
      {children}
    </LedgerSettingsContext.Provider>
  );
}

export function useLedgerSettings() {
  const ctx = React.useContext(LedgerSettingsContext);
  if (!ctx) {
    throw new Error(
      "useLedgerSettings must be used within a LedgerSettingsProvider",
    );
  }
  return ctx;
}
