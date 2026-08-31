"use client";

import * as React from "react";
import { LedgerClient } from "@/lib/ledger-api";
import { useLedgerSettings } from "@/lib/ledger-settings";

export function useLedgerClient(): LedgerClient {
  const { baseUrl, ledgerId } = useLedgerSettings();
  return React.useMemo(
    () => new LedgerClient(baseUrl, ledgerId),
    [baseUrl, ledgerId],
  );
}
