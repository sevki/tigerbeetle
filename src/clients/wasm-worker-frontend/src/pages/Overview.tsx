import { Link } from "react-router-dom";
import { ArrowRight, Landmark, ArrowLeftRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DtBankLogo } from "@/components/brand/dt-bank-logo";
import { useLedgerSettings } from "@/lib/ledger-settings";
import { useLocalHistory } from "@/lib/local-history";

export function OverviewPage() {
  const { ledgerId } = useLedgerSettings();
  const accounts = useLocalHistory("accounts", ledgerId);
  const transfers = useLocalHistory("transfers", ledgerId);

  return (
    <div className="space-y-10">
      <section className="flex flex-col items-start gap-4 py-8">
        <DtBankLogo className="scale-125" />
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-balance">
          A ledger backed by TigerBeetle, running as a Durable Object.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          This ledger (<code className="font-mono">{ledgerId}</code>) is
          served by the real TigerBeetle state machine and LSM storage
          engine, compiled to WebAssembly. This page is served by the same
          Worker as the API it calls.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link to="/accounts">
              Open accounts <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/transfers">Open transfers</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Accounts seen from this browser</CardDescription>
            <CardTitle className="text-3xl">{accounts.ids.length}</CardTitle>
            <CardAction>
              <Wallet className="h-5 w-5 text-brand-green" />
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transfers seen from this browser</CardDescription>
            <CardTitle className="text-3xl">{transfers.ids.length}</CardTitle>
            <CardAction>
              <ArrowLeftRight className="h-5 w-5 text-brand-green" />
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Ledger</CardDescription>
            <CardTitle className="truncate text-3xl">{ledgerId}</CardTitle>
            <CardAction>
              <Landmark className="h-5 w-5 text-brand-green" />
            </CardAction>
          </CardHeader>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>About this demo</CardTitle>
            <CardDescription>
              What&apos;s real here, and what this UI is doing on top of it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The Worker has no &quot;list all accounts/transfers&quot;
              endpoint — only create and lookup-by-ID. So this UI remembers,
              per ledger, the IDs it has created in{" "}
              <em>this browser</em> (via <code>localStorage</code>) and
              re-resolves them from the ledger on each visit. It won&apos;t
              show entities created elsewhere, and clearing site data clears
              the list — the ledger itself is unaffected either way.
            </p>
            <p>
              Use the ledger ID field in the header (top right) to switch
              which ledger within this Worker you&apos;re viewing.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
