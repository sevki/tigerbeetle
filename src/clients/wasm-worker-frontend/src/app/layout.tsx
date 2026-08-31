import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { LedgerSettingsProvider } from "@/lib/ledger-settings";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import Footer from "@/components/footer/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DT Bank",
  description:
    "A single-node TigerBeetle ledger running as a Cloudflare Durable Object.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider defaultTheme="system" storageKey="dt-bank:theme">
          <LedgerSettingsProvider>
            <TooltipProvider>
              <SiteHeader />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
                {children}
              </main>
              <Footer companyName="DT Bank" companyNumber="" companyNumberUrl="">
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
            </TooltipProvider>
          </LedgerSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
