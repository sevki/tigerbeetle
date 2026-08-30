import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TigerBeetleWasm } from "../src/tb_wasm.mjs";

// Drives tb_wasm.wasm directly (no celld/workerd) to regression-test the engine's own
// resource-management fixes — in particular, that `state_machine.compact()` is actually driven
// after every commit (see build_wasm's comment in build.zig and tb_wasm.zig's tb_wasm_submit).
// Before that fix, this engine crashed (`TableMemory.put` assertion) after roughly 120 created
// accounts; skipping this test would let that regress silently, since none of the other test
// files create anywhere near that many events.

const wasmPath = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "../../../zig-out/wasm/tb_wasm.wasm",
);

describe("tb_wasm.wasm engine", () => {
  it("sustains thousands of created accounts without crashing (compaction regression)", async () => {
    const bytes = await readFile(wasmPath);
    const engine = await TigerBeetleWasm.instantiate(bytes);

    const TARGET = 3000; // Comfortably past the ~120-account crash this regression-tests for,
    // and well under the ~11,000-account storage_size_limit this engine is configured with
    // (see grid_extra_blocks in tb_wasm.zig) — this test is about compaction working, not about
    // exhausting that limit.
    const BATCH = 8;
    let created = 0n;
    let id = 1n;
    while (created < TARGET) {
      const accounts = [];
      const n = BigInt(Math.min(BATCH, TARGET - Number(created)));
      for (let i = 0n; i < n; i++) accounts.push({ id: id++, ledger: 1, code: 10 });
      const results = engine.createAccounts(accounts);
      for (const r of results) {
        expect(r.status).toBe(0xffffffff);
      }
      created += n;
    }

    expect(created).toBe(BigInt(TARGET));
    engine.deinit();
  }, 120000);
});
