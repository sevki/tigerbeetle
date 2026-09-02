import * as React from "react";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLedgerClient } from "@/lib/use-ledger-client";
import type { Code } from "@/lib/ledger-api";

const CUSTOM = "__custom__";

function codeKey(c: Pick<Code, "ledger" | "code">) {
  return `${c.ledger}:${c.code}`;
}

// Picks a TigerBeetle (ledger, code) pair -- a dropdown of whatever this ledgerId has registered
// meanings for (see wasm-worker/API.md's "Names and codes"), falling back to raw number inputs
// either while nothing's registered yet or for an unregistered pair. Shared by the Accounts and
// Transfers create forms so both stay in sync with the /codes registry.
export function CodeSelect({
  ledger,
  code,
  onChange,
  idPrefix,
}: {
  ledger: string;
  code: string;
  onChange: (ledger: string, code: string) => void;
  idPrefix: string;
}) {
  const client = useLedgerClient();
  const [codes, setCodes] = React.useState<Code[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    client
      .listCodes()
      .then((c) => {
        if (!cancelled) setCodes(c);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const selected = codes.find(
    (c) => String(c.ledger) === ledger && String(c.code) === code,
  );
  const value = selected ? codeKey(selected) : CUSTOM;
  const showRawInputs = value === CUSTOM || !loaded;

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-registry`}>Ledger / code</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === CUSTOM) return;
          const [l, c] = v.split(":");
          onChange(l, c);
        }}
      >
        <SelectTrigger id={`${idPrefix}-registry`}>
          <SelectValue placeholder="Select a currency or unit" />
        </SelectTrigger>
        <SelectContent>
          {codes.map((c) => (
            <SelectItem key={codeKey(c)} value={codeKey(c)}>
              {c.symbol} {c.name} (ledger {c.ledger}, code {c.code})
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom (raw ledger/code)…</SelectItem>
        </SelectContent>
      </Select>
      {loaded && codes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing registered yet —{" "}
          <Link to="/codes" className="underline underline-offset-2">
            register a currency or unit
          </Link>{" "}
          to pick it here next time.
        </p>
      )}
      {showRawInputs && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            id={`${idPrefix}-ledger`}
            type="number"
            aria-label="Ledger"
            placeholder="Ledger"
            value={ledger}
            onChange={(e) => onChange(e.target.value, code)}
            required
          />
          <Input
            id={`${idPrefix}-code`}
            type="number"
            aria-label="Code"
            placeholder="Code"
            value={code}
            onChange={(e) => onChange(ledger, e.target.value)}
            required
          />
        </div>
      )}
    </div>
  );
}
