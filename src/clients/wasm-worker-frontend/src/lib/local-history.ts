"use client";

import * as React from "react";

// The Worker's API has no "list all accounts/transfers" endpoint (see API.md) — only
// create/lookup-by-ID. To make the UI browsable at all, we remember the IDs created *from this
// browser* per ledger, and re-resolve them via lookup_accounts/lookup_transfers on each visit.
// This is purely a client-side convenience list, not a source of truth: it won't show entities
// created by another client or session, and clearing site data clears it.

function key(kind: "accounts" | "transfers", ledgerId: string) {
  return `dt-bank:history:${kind}:${ledgerId}`;
}

function readIds(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useLocalHistory(
  kind: "accounts" | "transfers",
  ledgerId: string,
) {
  const storageKey = key(kind, ledgerId);
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read, client-only
    setIds(readIds(storageKey));
  }, [storageKey]);

  const add = React.useCallback(
    (newIds: string[]) => {
      setIds((prev) => {
        const merged = Array.from(new Set([...prev, ...newIds]));
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(merged));
        } catch {
          // Best-effort only.
        }
        return merged;
      });
    },
    [storageKey],
  );

  return { ids, add };
}
