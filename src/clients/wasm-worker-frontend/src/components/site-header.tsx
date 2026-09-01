import { Link, useLocation } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { DtBankLogo } from "@/components/brand/dt-bank-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ThemeToggle from "@/components/theme-toggle/theme-toggle";
import { useLedgerSettings } from "@/lib/ledger-settings";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Overview" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transfers", label: "Transfers" },
  { href: "/codes", label: "Codes" },
];

export function SiteHeader() {
  const { pathname } = useLocation();
  const { ledgerId, setLedgerId } = useLedgerSettings();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-8">
          <Link to="/" aria-label="DT Bank home">
            <DtBankLogo />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === link.href && "bg-accent text-accent-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">{ledgerId}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Ledger</h4>
                <p className="text-xs text-muted-foreground">
                  The ledger ID within this Worker to view. The API itself is
                  always this same origin.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ledger-id">Ledger ID</Label>
                <Input
                  id="ledger-id"
                  value={ledgerId}
                  onChange={(e) => setLedgerId(e.target.value)}
                  placeholder="default"
                />
              </div>
            </PopoverContent>
          </Popover>
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex items-center gap-1 border-t px-4 py-1.5 sm:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground",
              pathname === link.href && "bg-accent text-accent-foreground",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
