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

## API

See [`API.md`](./API.md) for the HTTP API (`/ledger/{ledgerId}/{accounts,transfers,
lookup_accounts,lookup_transfers}`) — endpoints, request/response fields, and error handling.
[`openapi.yaml`](./openapi.yaml) is the machine-readable version of the same API. `npm run
generate:client` runs [openapi-typescript](https://openapi-ts.dev) to turn it into
`src/openapi.d.ts` (generated, gitignored, regenerated automatically before `test:celld` — see
`pretest:celld`).

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
clones the whole `tigerbeetle` repo. The Deploy/Version commands run from the **repo root**
regardless of the dashboard's "Root directory" setting (that setting only scopes the separate
Build command phase, which this package leaves empty), so the commands `cd` into this package
themselves:

| Setting | Value |
| - | - |
| Root directory | *(doesn't matter — see above; leave as default)* |
| Build command | *(leave empty — the deploy/version commands below build inline)* |
| Deploy command | `cd src/clients/wasm-worker && npm install && npm run build && npx wrangler deploy` |
| Version command | `cd src/clients/wasm-worker && npm install && npm run build && npx wrangler versions upload` |

`npm run build` itself is `cd ../../.. && ./zig/download.sh && ./zig/zig build wasm` (see
`package.json`) — it steps back out to the repo root to invoke Zig, then the `wrangler`
commands run back inside `src/clients/wasm-worker` where `wrangler.toml` lives.

If a build fails with `npm error enoent ... open '.../repo/package.json'`, the Deploy/Version
command is running from the repo root without first `cd`-ing into `src/clients/wasm-worker` —
setting "Root directory" in the dashboard does **not** fix this for the deploy/version commands,
only an explicit `cd` in the command itself does.
