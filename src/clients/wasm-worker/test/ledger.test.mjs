import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startCelld } from "./celld_harness.mjs";

// These tests run against a real `celld dev` process (https://celld.dev), not a mock of it —
// they prove `tb_wasm.wasm` actually loads and runs the production TigerBeetle state
// machine/LSM under a genuine Workers/Durable-Objects-compatible runtime, driven through the
// `TigerBeetleLedger` Durable Object exactly as deployed.
const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watchDir = path.join(packageDir, ".celld-test-state");
const port = 19870 + (Number(process.env.VITEST_POOL_ID ?? 0) % 100);

let celld;

beforeAll(async () => {
  await rm(watchDir, { recursive: true, force: true });
  celld = startCelld({ port, watchDir });
  await celld.waitUntilReady();
}, 60000);

afterAll(async () => {
  await celld?.stop();
  await rm(watchDir, { recursive: true, force: true });
});

async function post(ledgerId, path_, body) {
  const res = await fetch(`${celld.url}/ledger/${ledgerId}/${path_}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe("TigerBeetleLedger Durable Object (on celld)", () => {
  it("creates two accounts and moves a transfer between them symmetrically", async () => {
    const accountsRes = await post("test-basic", "accounts", [
      { id: "1", ledger: 1, code: 10 },
      { id: "2", ledger: 1, code: 10 },
    ]);
    expect(accountsRes.status).toBe(200);
    expect(accountsRes.json).toEqual([
      { timestamp: expect.any(String), status: 0xffffffff },
      { timestamp: expect.any(String), status: 0xffffffff },
    ]);

    const transferRes = await post("test-basic", "transfers", [
      { id: "100", debit_account_id: "1", credit_account_id: "2", amount: "100", ledger: 1, code: 10 },
    ]);
    expect(transferRes.status).toBe(200);
    expect(transferRes.json[0].status).toBe(0xffffffff);

    const lookupRes = await post("test-basic", "lookup_accounts", ["1", "2"]);
    expect(lookupRes.json[0].debits_posted).toBe("100");
    expect(lookupRes.json[1].credits_posted).toBe("100");
  });

  it("rejects a transfer that would exceed a debits_must_not_exceed_credits account's credits", async () => {
    await post("test-reject", "accounts", [
      { id: "3", ledger: 1, code: 10, flags: 0x0002 }, // debits_must_not_exceed_credits
      { id: "4", ledger: 1, code: 10 },
    ]);

    const res = await post("test-reject", "transfers", [
      { id: "200", debit_account_id: "3", credit_account_id: "4", amount: "1000", ledger: 1, code: 10 },
    ]);

    expect(res.json[0].status).toBe(54); // exceeds_credits
  });

  it("persists state across a real celld process restart via operation-log replay", async () => {
    await post("test-persistence", "accounts", [
      { id: "10", ledger: 1, code: 10 },
      { id: "11", ledger: 1, code: 10 },
    ]);
    await post("test-persistence", "transfers", [
      { id: "300", debit_account_id: "10", credit_account_id: "11", amount: "42", ledger: 1, code: 10 },
    ]);

    // Kill the whole celld process and start a fresh one against the same durable state
    // directory — this is a stronger test than in-process DO eviction: nothing survives except
    // what actually made it to durable storage.
    await celld.stop();
    celld = startCelld({ port, watchDir });
    await celld.waitUntilReady();

    const lookupRes = await post("test-persistence", "lookup_accounts", ["10", "11"]);
    expect(lookupRes.json[0].debits_posted).toBe("42");
    expect(lookupRes.json[1].credits_posted).toBe("42");
  }, 60000);
});
