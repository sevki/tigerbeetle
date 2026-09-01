import * as React from "react";
import { toast } from "sonner";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLedgerClient } from "@/lib/use-ledger-client";
import { useLedgerSettings } from "@/lib/ledger-settings";
import { type Code, LedgerApiError } from "@/lib/ledger-api";

// TigerBeetle's `ledger`/`code` fields (distinct from the `<ledgerId>` that picks this Durable
// Object -- see wasm-worker/API.md) are bare integers with no built-in meaning. This page manages
// this ledgerId's own registry of what each (ledger, code) pair actually is: a currency, or a
// non-monetary unit like compute or storage.
export function CodesPage() {
  const client = useLedgerClient();
  const { ledgerId } = useLedgerSettings();

  const [codes, setCodes] = React.useState<Code[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    ledger: "1",
    code: "10",
    kind: "currency",
    symbol: "$",
    name: "US Dollar",
    decimals: "2",
  });

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setCodes(await client.listCodes());
    } catch (err) {
      toast.error("Failed to load codes", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [client]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await client.upsertCodes([
        {
          ledger: Number(form.ledger),
          code: Number(form.code),
          kind: form.kind,
          symbol: form.symbol,
          name: form.name,
          decimals: Number(form.decimals || 0),
        },
      ]);
      setCodes(updated);
      toast.success("Code registered", {
        description: `ledger ${form.ledger}, code ${form.code}`,
      });
    } catch (err) {
      toast.error("Failed to register code", {
        description:
          err instanceof LedgerApiError ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Codes</h1>
          <p className="text-sm text-muted-foreground">
            Ledger <code className="font-mono">{ledgerId}</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Register a code</CardTitle>
            <CardDescription>
              What a TigerBeetle <code className="font-mono">(ledger, code)</code> pair means --
              a currency, or a unit like compute or storage. Posts to{" "}
              <code className="font-mono">/codes</code>; re-registering a pair overwrites it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSave}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code-ledger">Ledger</Label>
                  <Input
                    id="code-ledger"
                    type="number"
                    value={form.ledger}
                    onChange={(e) => setForm((f) => ({ ...f, ledger: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-code">Code</Label>
                  <Input
                    id="code-code"
                    type="number"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code-kind">Kind</Label>
                <Input
                  id="code-kind"
                  placeholder="currency, compute, storage, ..."
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code-name">Name</Label>
                <Input
                  id="code-name"
                  placeholder="US Dollar"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code-symbol">Symbol</Label>
                  <Input
                    id="code-symbol"
                    placeholder="$"
                    value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-decimals">Decimals</Label>
                  <Input
                    id="code-decimals"
                    type="number"
                    min={0}
                    value={form.decimals}
                    onChange={(e) => setForm((f) => ({ ...f, decimals: e.target.value }))}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                <Plus className="h-4 w-4" />
                {saving ? "Saving…" : "Register code"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered codes</CardTitle>
            <CardDescription>
              Every (ledger, code) pair this ledgerId has given a meaning to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : codes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No codes registered yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ledger</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Decimals</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((c) => (
                      <TableRow key={`${c.ledger}-${c.code}`}>
                        <TableCell>
                          <Badge variant="secondary">{c.ledger}</Badge>
                        </TableCell>
                        <TableCell>{c.code}</TableCell>
                        <TableCell>{c.kind}</TableCell>
                        <TableCell className="font-mono">{c.symbol}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {c.decimals}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
