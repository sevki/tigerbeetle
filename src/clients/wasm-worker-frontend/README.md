# DT Bank frontend

A Next.js UI for [`src/clients/wasm-worker`](../wasm-worker) — the TigerBeetle ledger running as
a Cloudflare Durable Object. Talks to that Worker's HTTP API only (see
[`../wasm-worker/API.md`](../wasm-worker/API.md)); has no server-side state or backend of its own.

Deliberately kept as a **sibling** of `wasm-worker`, not nested inside it: `celld dev`/`wrangler
dev` watch their project directory recursively for changes, and this app's `node_modules`/`.next`
churn was observed to put `celld dev` into a continuous rebuild-restart loop when it lived inside
`wasm-worker/`.

## Run it

```console
pnpm install
pnpm dev
```

Then open http://localhost:3000. By default it points at `http://localhost:9876` — a `celld dev`
or `wrangler dev` instance of `wasm-worker` (see that package's README for how to start one).
Override the default with `NEXT_PUBLIC_LEDGER_API_BASE`, or change it live from the connection
settings icon in the header (persisted to `localStorage`, so it survives reloads).

## What's here

- `src/lib/ledger-api.ts` — a thin typed client for the Worker's HTTP API.
- `src/lib/ledger-settings.tsx` — the Worker base URL / ledger ID the UI is pointed at, editable
  from the header and persisted client-side.
- `src/lib/local-history.ts` — the Worker's API has no "list all accounts/transfers" endpoint
  (create and lookup-by-ID only), so the UI remembers, per ledger, which IDs it created *from this
  browser* and re-resolves them on each visit. This is a client-side convenience list, not a
  source of truth — it won't show entities created elsewhere, and clearing site data clears it
  without touching the ledger.
- `src/app/accounts`, `src/app/transfers` — create/lookup UIs for each.
- `src/components/ui/*` — [shadcn/ui](https://ui.shadcn.com) primitives, some pulled from the
  [ui.devtools.ltd](https://ui.devtools.ltd) registry (`footer`, `theme-toggle`'s base) and
  adapted; the registry's heavier app-shell pieces (auth, notifications, command palette) were
  left unwired since this ledger has no use for them.
- `src/components/brand/dt-bank-logo.tsx` — the DT Bank mark, as inline SVG.

## Build

```console
pnpm build
```
