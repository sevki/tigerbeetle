# DT Bank frontend

A Vite + React + [shadcn/ui](https://ui.shadcn.com) SPA for
[`src/clients/wasm-worker`](../wasm-worker) — the TigerBeetle ledger running as a Cloudflare
Durable Object.

Built and served as **static assets by that same Worker** (`wrangler.toml`/`.jsonc`'s `[assets]`,
`run_worker_first: true`, routing implemented in `../wasm-worker/src/index.mjs`) — one
deployment, one origin. All API calls (`src/lib/ledger-api.ts`) are relative fetches (`/ledger/
...`), so there's no CORS to configure and no separate base-URL setting: this app is never
deployed anywhere else.

Deliberately kept as a **sibling** of `wasm-worker`, not nested inside it: `celld dev`/`wrangler
dev` watch their project directory recursively for changes, and this app's `node_modules`/`dist`
churn was observed to put `celld dev` into a continuous rebuild-restart loop when it lived inside
`wasm-worker/`.

## Run it

```console
pnpm install
pnpm dev
```

Then open http://localhost:5173. `vite.config.ts` proxies `/ledger/*` to a `celld dev`/`wrangler
dev` instance of `wasm-worker` on `localhost:9876` by default (override with
`VITE_LEDGER_PROXY_TARGET`) — start one alongside (see that package's README).

## Deploying: build into `../wasm-worker/public`

`wasm-worker`'s `[assets].directory` points at `./public`, not at this package directly — celld
requires the assets directory to live *inside* the project it serves, so `../wasm-worker-
frontend/dist` can't be referenced directly. `pnpm build` builds this app; copying `dist/` into
`../wasm-worker/public` is a separate step, done for you by `wasm-worker`'s own `npm run build`
(and by this package's `pretest:e2e`) — see those scripts rather than running `pnpm build` alone
and expecting the Worker to pick it up.

## What's here

- `src/lib/ledger-api.ts` — a typed client for the Worker's HTTP API, built on
  [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) against `src/openapi.d.ts` (generated
  from `../wasm-worker/openapi.yaml` — the canonical spec — by `pnpm generate:client`, run
  automatically before `dev`/`build`).
- `src/lib/ledger-settings.tsx` — the ledger ID the UI is pointed at (the only runtime setting;
  see above for why there's no base-URL setting), editable from the header and persisted
  client-side.
- `src/lib/local-history.ts` — the Worker's API has no "list all accounts/transfers" endpoint
  (create and lookup-by-ID only), so the UI remembers, per ledger, which IDs it created *from
  this browser* and re-resolves them on each visit. This is a client-side convenience list, not a
  source of truth — it won't show entities created elsewhere, and clearing site data clears it
  without touching the ledger.
- `src/pages/` — Overview, Accounts, Transfers, routed with
  [react-router](https://reactrouter.com).
- `src/components/ui/*` — shadcn/ui primitives, some pulled from the
  [ui.devtools.ltd](https://ui.devtools.ltd) registry (`footer`, `theme-toggle`'s base) and
  adapted; the registry's heavier app-shell pieces (auth, notifications, command palette) were
  left unwired since this ledger has no use for them.
- `src/components/brand/dt-bank-logo.tsx` — the DT Bank mark, as inline SVG.

## Build

```console
pnpm build
```

## End-to-end tests

```console
pnpm test:e2e
```

Drives the built app with [Playwright](https://playwright.dev) against a real `celld dev`
instance of `wasm-worker` (`e2e/global-setup.ts`, reusing that package's own test harness) --
same origin serving both the SPA and the API, exactly as production does. No separate dev server
is started for this: `pretest:e2e` builds and copies into `../wasm-worker/public` first.
