# TigerBeetle WASM Worker

A single-node, in-memory TigerBeetle ledger running inside a Cloudflare Worker (as a Durable
Object), backed by the production TigerBeetle state machine and LSM storage engine compiled to
`wasm32-wasi`.

## What this is (and isn't)

- **Is**: the real `src/state_machine.zig`/LSM code, driven directly (no VSR replication) against
  an in-memory storage backend, the same one TigerBeetle's own deterministic simulator (the VOPR)
  uses — see `src/wasm/tb_wasm.zig`. TigerBeetle's production IO (`src/io.zig`, io_uring/kqueue/
  IOCP) is never reachable from this build.
- **Isn't**: a real TigerBeetle cluster, and doesn't survive a Worker/container being torn down on
  its own. The `TigerBeetleLedger` Durable Object works around that by logging every committed
  operation to durable storage and replaying it on cold start (see the comment at the top of
  `src/index.mjs`) — sound because the engine is fully deterministic, but still `O(operations
  since last restart)` on cold start, with no snapshotting/compaction of the log yet.

## Build the WASM module

From the repo root:

```console
./zig/zig build wasm
```

Produces `zig-out/wasm/tb_wasm.wasm`, which this package imports directly (see `wrangler.toml`'s
`CompiledWasm` rule and `src/index.mjs`'s `import wasmModule from ".../tb_wasm.wasm"`).

## Test

```console
npm install
npm test          # runs test/ledger.test.mjs inside real workerd, via @cloudflare/vitest-pool-workers
node test/smoke.node.mjs ../../../zig-out/wasm/tb_wasm.wasm   # quick sanity check outside workerd
```

## Run locally

```console
npm run dev        # wrangler dev
curl -X POST localhost:8787/ledger/my-ledger/accounts -d '[{"id":"1","ledger":1,"code":10}]'
```
