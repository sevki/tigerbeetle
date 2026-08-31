import * as React from "react";

// The ledger ID is the only runtime-configurable setting: this SPA is served by the same
// Worker/origin as the API it calls (see wrangler.toml's [assets] + README.md), so there's no
// separate "API base URL" to configure — requests are always relative, same-origin.

const STORAGE_KEY = "dt-bank:ledger-id";
const DEFAULT_LEDGER_ID = "default";

interface LedgerSettingsContextValue {
  ledgerId: string;
  setLedgerId: (ledgerId: string) => void;
}

const LedgerSettingsContext = React.createContext<
  LedgerSettingsContextValue | undefined
>(undefined);

function readStoredLedgerId(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LEDGER_ID;
  } catch {
    return DEFAULT_LEDGER_ID;
  }
}

export function LedgerSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ledgerId, setLedgerIdState] = React.useState(readStoredLedgerId);

  const setLedgerId = React.useCallback((next: string) => {
    setLedgerIdState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort only — a private-browsing tab throwing here shouldn't break the UI.
    }
  }, []);

  const value = React.useMemo(
    () => ({ ledgerId, setLedgerId }),
    [ledgerId, setLedgerId],
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
