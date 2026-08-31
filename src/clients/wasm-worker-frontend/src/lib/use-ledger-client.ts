import * as React from "react";
import { LedgerClient } from "@/lib/ledger-api";
import { useLedgerSettings } from "@/lib/ledger-settings";

export function useLedgerClient(): LedgerClient {
  const { ledgerId } = useLedgerSettings();
  // "" -- relative, same-origin. See ledger-settings.tsx.
  return React.useMemo(() => new LedgerClient("", ledgerId), [ledgerId]);
}
