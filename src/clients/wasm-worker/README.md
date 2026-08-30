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

## Test

```console
npm install
npm test           # both suites: real celld, then real workerd
npm run test:celld    # just test/ledger.celld.test.mjs, against a spawned `celld dev` process
npm run test:workerd  # just test/ledger.workerd.test.mjs, inside workerd via vitest-pool-workers
node test/smoke.node.mjs ../../../zig-out/wasm/tb_wasm.wasm   # quick sanity check outside either runtime
```

## Run locally

```console
npm run dev            # celld dev .
npm run dev:workerd    # wrangler dev
curl -X POST localhost:9876/ledger/my-ledger/accounts -d '[{"id":"1","ledger":1,"code":10}]'
```
