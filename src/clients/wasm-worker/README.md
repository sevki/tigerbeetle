# TigerBeetle WASM Worker

A single-node, in-memory TigerBeetle ledger running as a Durable Object, backed by the
production TigerBeetle state machine and LSM storage engine compiled to `wasm32-wasi`.

`src/index.mjs`'s `TigerBeetleLedger` class is a plain Durable Object with no runtime-specific
code, and runs unmodified on **both**:

- [celld](https://celld.dev) — a self-hosted, API-compatible reimplementation of the Workers/
  Durable Objects runtime (config: `wrangler.jsonc`), and
- Cloudflare's own `workerd`, via `@cloudflare/vitest-pool-workers`/`wrangler` (config:
  `wrangler.toml`).

Both configs describe the same Worker; they're kept as separate files because celld rejects
`wrangler.toml`'s `rules` key outright (it bundles `.wasm` imports automatically and doesn't need
it), and because celld reads `wrangler.jsonc` while `wrangler`/vitest-pool-workers default to
`wrangler.toml` when both are present — so each tool picks up its own file without needing the
other's config touched.

## What this is (and isn't)

- **Is**: the real `src/state_machine.zig`/LSM code, driven directly (no VSR replication) against
  an in-memory storage backend, the same one TigerBeetle's own deterministic simulator (the VOPR)
  uses — see `src/wasm/tb_wasm.zig`. TigerBeetle's production IO (`src/io.zig`, io_uring/kqueue/
  IOCP) is never reachable from this build.
- **Isn't**: a real TigerBeetle cluster. `TigerBeetleLedger` works around the wasm engine's own
  lack of real persistence by logging every committed operation to durable storage and replaying
  it on cold start (see the comment at the top of `src/index.mjs`) — sound because the engine is
  fully deterministic, but still `O(operations since last restart)` on cold start, with no
  snapshotting/compaction of the log yet.

## Build the WASM module

From the repo root:

```console
./zig/zig build wasm
```

Produces `zig-out/wasm/tb_wasm.wasm`, which this package imports directly (see
`src/index.mjs`'s `import wasmModule from ".../tb_wasm.wasm"`).

## Install celld

```console
curl -fsSL https://celld.dev/install.sh | sh
```

`celld deploy`/`celld dev` bundle the Worker with [esbuild](https://esbuild.github.io), which
must be on `PATH` — `npm install` below pulls it in as a local devDependency, and `npm`/`npx`
scripts put `node_modules/.bin` on `PATH` automatically.

## API schema

`openapi.yaml` describes the HTTP API (`/ledger/{ledgerId}/{accounts,transfers,lookup_accounts,
lookup_transfers}`) that `src/index.mjs` serves — request/response shapes for `Account`/
`Transfer`/`CreateResult`, matching `src/tigerbeetle.zig`'s wire types (u128/u64 values as
decimal strings, since JSON numbers can't hold them). `npm run generate:client` runs
[openapi-typescript](https://openapi-ts.dev) to turn it into `src/openapi.d.ts` (generated,
gitignored, regenerated automatically before `test:celld` — see `pretest:celld`).

`test/openapi.celld.test.mjs` drives the same real `celld dev` process as the other celld tests,
but through an [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) client typed against that
generated schema, and additionally validates every raw JSON response against `openapi.yaml`'s
schemas with [ajv](https://ajv.js.org) — catching the spec and the server actually disagreeing at
runtime, not just a compile-time type mismatch.

## Test

```console
npm install
npm test           # everything: celld (ledger + openapi-client suites), then workerd
npm run test:celld    # test/*.celld.test.mjs, against a spawned `celld dev` process
npm run test:workerd  # test/ledger.workerd.test.mjs, inside workerd via vitest-pool-workers
node test/smoke.node.mjs ../../../zig-out/wasm/tb_wasm.wasm   # quick sanity check outside either runtime
```

## Run locally

```console
npm run dev            # celld dev .
npm run dev:workerd    # wrangler dev
curl -X POST localhost:9876/ledger/my-ledger/accounts -d '[{"id":"1","ledger":1,"code":10}]'
```

## Deploy via Cloudflare Workers Builds

This package is designed to be deployed straight from Cloudflare's dashboard-configured Git
integration ([Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)), which
clones the whole `tigerbeetle` repo but only runs commands inside a configured root directory.
Because `zig build wasm` (see above) must run from the *repo root* — it needs `build.zig` and the
rest of the Zig sources, not just this package — `build`/`deploy`/`version` all `cd` there first:

| Setting | Value |
| - | - |
| Root directory | `src/clients/wasm-worker` |
| Build command | *(leave empty — the deploy/version commands below build inline)* |
| Deploy command | `npm install && npm run build && npx wrangler deploy` |
| Version command | `npm install && npm run build && npx wrangler versions upload` |

`npm run build` itself is `cd ../../.. && ./zig/download.sh && ./zig/zig build wasm` (see
`package.json`), which is why it doesn't matter that Root directory is scoped to this package —
the build step steps back out to the repo root itself before invoking Zig.

If a build fails with `npm error enoent ... open '.../repo/package.json'`, the build ran with
Root directory effectively `/` instead of `src/clients/wasm-worker` — Cloudflare's dashboard can
reuse a stale config snapshot on a manual "Retry build", so re-saving the Root directory field
alone isn't enough to fix an in-flight or retried build; trigger a genuinely new build (e.g. a
fresh commit push) to pick up the current settings.
