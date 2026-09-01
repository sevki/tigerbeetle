import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Search, Plus } from "lucide-react";
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
import { useLocalHistory } from "@/lib/local-history";
import { randomId } from "@/lib/id";
import { STATUS_OK, type Transfer, LedgerApiError } from "@/lib/ledger-api";
import { formatAmount } from "@/lib/currency";

export function TransfersPage() {
  const client = useLedgerClient();
  const { ledgerId } = useLedgerSettings();
  const history = useLocalHistory("transfers", ledgerId);
  const accountHistory = useLocalHistory("accounts", ledgerId);

  const [transfers, setTransfers] = React.useState<Transfer[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchId, setSearchId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    id: randomId(),
    debit_account_id: "",
    credit_account_id: "",
    amount: "100",
    ledger: "1",
    code: "10",
  });

  const refresh = React.useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setTransfers([]);
        return;
      }
      setLoading(true);
      try {
        setTransfers(await client.lookupTransfers(ids));
      } catch (err) {
        toast.error("Failed to load transfers", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  React.useEffect(() => {
    refresh(history.ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, history.ids.join(",")]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.debit_account_id.trim() || !form.credit_account_id.trim()) {
      toast.error("Debit and credit account IDs are required");
      return;
    }
    setCreating(true);
    try {
      const [result] = await client.createTransfers([
        {
          id: form.id,
          debit_account_id: form.debit_account_id.trim(),
          credit_account_id: form.credit_account_id.trim(),
          amount: form.amount,
          ledger: Number(form.ledger),
          code: Number(form.code),
          flags: 0,
        },
      ]);
      if (result.status !== STATUS_OK) {
        toast.error(`Transfer rejected (status ${result.status})`);
        return;
      }
      toast.success("Transfer created", { description: form.id });
      history.add([form.id]);
      setForm((f) => ({ ...f, id: randomId() }));
    } catch (err) {
      toast.error("Failed to create transfer", {
        description:
          err instanceof LedgerApiError ? err.message : String(err),
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchId.trim()) return;
    try {
      const found = await client.lookupTransfers([searchId.trim()]);
      if (found.length === 0) {
        toast.error("No transfer found with that ID");
        return;
      }
      history.add([searchId.trim()]);
      setSearchId("");
    } catch (err) {
      toast.error("Lookup failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Ledger <code className="font-mono">{ledgerId}</code>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh(history.ids)}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create transfer</CardTitle>
            <CardDescription>
              Posts to <code className="font-mono">/transfers</code>.
              {accountHistory.ids.length === 0 && (
                <>
                  {" "}
                  You&apos;ll need at least two{" "}
                  <Link to="/accounts" className="underline underline-offset-2">
                    accounts
                  </Link>{" "}
                  first.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="xfer-id">Transfer ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="xfer-id"
                    value={form.id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, id: e.target.value }))
                    }
                    className="font-mono"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate a new ID"
                    onClick={() =>
                      setForm((f) => ({ ...f, id: randomId() }))
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="xfer-debit">Debit account ID</Label>
                <Input
                  id="xfer-debit"
                  value={form.debit_account_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      debit_account_id: e.target.value,
                    }))
                  }
                  className="font-mono"
                  placeholder="Account ID to debit"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="xfer-credit">Credit account ID</Label>
                <Input
                  id="xfer-credit"
                  value={form.credit_account_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      credit_account_id: e.target.value,
                    }))
                  }
                  className="font-mono"
                  placeholder="Account ID to credit"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="xfer-amount">Amount</Label>
                  <Input
                    id="xfer-amount"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="xfer-ledger">Ledger</Label>
                  <Input
                    id="xfer-ledger"
                    type="number"
                    value={form.ledger}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ledger: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="xfer-code">Code</Label>
                  <Input
                    id="xfer-code"
                    type="number"
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, code: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                <Plus className="h-4 w-4" />
                {creating ? "Creating…" : "Create transfer"}
              </Button>
            </form>

            <form
              className="mt-6 flex gap-2 border-t pt-6"
              onSubmit={handleSearch}
            >
              <Input
                placeholder="Look up transfer by ID"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Known transfers</CardTitle>
            <CardDescription>
              Transfers created or looked up from this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : transfers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transfers yet — create one to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Ledger</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">
                          {t.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {t.debit_account_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {t.credit_account_id}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(t.amount, t.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{t.ledger}</Badge>
                          {t.currency ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {t.currency.name}
                            </span>
                          ) : null}
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
