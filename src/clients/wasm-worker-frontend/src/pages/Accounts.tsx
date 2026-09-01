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
import { STATUS_OK, type Account, LedgerApiError } from "@/lib/ledger-api";
import { formatAmount } from "@/lib/currency";

export function AccountsPage() {
  const client = useLedgerClient();
  const { ledgerId } = useLedgerSettings();
  const history = useLocalHistory("accounts", ledgerId);

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchId, setSearchId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    id: randomId(),
    name: "",
    ledger: "1",
    code: "10",
  });

  const refresh = React.useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setAccounts([]);
        return;
      }
      setLoading(true);
      try {
        const found = await client.lookupAccounts(ids);
        setAccounts(found);
      } catch (err) {
        toast.error("Failed to load accounts", {
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
    setCreating(true);
    try {
      const [result] = await client.createAccounts([
        {
          id: form.id,
          name: form.name.trim() || undefined,
          ledger: Number(form.ledger),
          code: Number(form.code),
          flags: 0,
        },
      ]);
      if (result.status !== STATUS_OK) {
        toast.error(`Account rejected (status ${result.status})`);
        return;
      }
      toast.success("Account created", { description: form.name.trim() || form.id });
      history.add([form.id]);
      setForm({ id: randomId(), name: "", ledger: form.ledger, code: form.code });
    } catch (err) {
      toast.error("Failed to create account", {
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
      const found = await client.lookupAccounts([searchId.trim()]);
      if (found.length === 0) {
        toast.error("No account found with that ID");
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
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
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
            <CardTitle>Create account</CardTitle>
            <CardDescription>
              Posts to <code className="font-mono">/accounts</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label htmlFor="acc-id">Account ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="acc-id"
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
                <Label htmlFor="acc-name">Name (optional)</Label>
                <Input
                  id="acc-name"
                  placeholder="Alice's checking"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="acc-ledger">Ledger</Label>
                  <Input
                    id="acc-ledger"
                    type="number"
                    value={form.ledger}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ledger: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acc-code">Code</Label>
                  <Input
                    id="acc-code"
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
                {creating ? "Creating…" : "Create account"}
              </Button>
            </form>

            <form
              className="mt-6 flex gap-2 border-t pt-6"
              onSubmit={handleSearch}
            >
              <Input
                placeholder="Look up account by ID"
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
            <CardTitle>Known accounts</CardTitle>
            <CardDescription>
              Accounts created or looked up from this browser (see{" "}
              <Link to="/" className="underline underline-offset-2">
                Overview
              </Link>{" "}
              for why this isn&apos;t a full ledger listing).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : accounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No accounts yet — create one to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Ledger</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">
                        Debits posted
                      </TableHead>
                      <TableHead className="text-right">
                        Credits posted
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          {a.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {a.id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{a.ledger}</Badge>
                        </TableCell>
                        <TableCell>
                          {a.code}
                          {a.currency ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({a.currency.name})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(a.debits_posted, a.currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(a.credits_posted, a.currency)}
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
