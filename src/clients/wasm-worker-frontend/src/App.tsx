import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme-context";
import { LedgerSettingsProvider } from "@/lib/ledger-settings";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import Footer from "@/components/footer/footer";
import { OverviewPage } from "@/pages/Overview";
import { AccountsPage } from "@/pages/Accounts";
import { TransfersPage } from "@/pages/Transfers";
import { CodesPage } from "@/pages/Codes";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="dt-bank:theme">
      <LedgerSettingsProvider>
        <TooltipProvider>
          <BrowserRouter>
            <div className="flex min-h-svh flex-col bg-background text-foreground">
              <SiteHeader />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
                <Routes>
                  <Route path="/" element={<OverviewPage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="/transfers" element={<TransfersPage />} />
                  <Route path="/codes" element={<CodesPage />} />
                </Routes>
              </main>
              <Footer
                companyName="DT Bank"
                companyNumber=""
                companyNumberUrl=""
              >
                <small className="text-muted-foreground">
                  DT Bank is a demo built on{" "}
                  <a
                    href="https://tigerbeetle.com"
                    className="underline underline-offset-2"
                  >
                    TigerBeetle
                  </a>
                  , compiled to WebAssembly and served from a Cloudflare
                  Durable Object.
                </small>
              </Footer>
              <Toaster />
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </LedgerSettingsProvider>
    </ThemeProvider>
  );
}
