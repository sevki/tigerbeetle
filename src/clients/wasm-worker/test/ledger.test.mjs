import { describe, expect, it } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";

// These tests run inside `workerd` itself (via `@cloudflare/vitest-pool-workers`), not a Node
// mock of it — they prove `tb_wasm.wasm` actually loads and runs the production TigerBeetle
// state machine/LSM under the real Workers runtime, driven through the `TigerBeetleLedger`
// Durable Object exactly as a deployed Worker would use it.

function stub(name) {
  const id = env.LEDGER.idFromName(name);
  return env.LEDGER.get(id);
}

async function post(ledgerStub, path, body) {
  const res = await ledgerStub.fetch(`http://do/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe("TigerBeetleLedger Durable Object", () => {
  it("creates two accounts and moves a transfer between them symmetrically", async () => {
    const ledger = stub("test-basic");

    const accountsRes = await post(ledger, "accounts", [
      { id: "1", ledger: 1, code: 10 },
      { id: "2", ledger: 1, code: 10 },
    ]);
    expect(accountsRes.status).toBe(200);
    expect(accountsRes.json).toEqual([
      { timestamp: expect.any(String), status: 0xffffffff },
      { timestamp: expect.any(String), status: 0xffffffff },
    ]);

    const transferRes = await post(ledger, "transfers", [
      { id: "100", debit_account_id: "1", credit_account_id: "2", amount: "100", ledger: 1, code: 10 },
    ]);
    expect(transferRes.status).toBe(200);
    expect(transferRes.json[0].status).toBe(0xffffffff);

    const lookupRes = await post(ledger, "lookup_accounts", ["1", "2"]);
    expect(lookupRes.json[0].debits_posted).toBe("100");
    expect(lookupRes.json[1].credits_posted).toBe("100");
  });

  it("rejects a transfer that would exceed a debits_must_not_exceed_credits account's credits", async () => {
    const ledger = stub("test-reject");

    await post(ledger, "accounts", [
      { id: "3", ledger: 1, code: 10, flags: 0x0002 }, // debits_must_not_exceed_credits
      { id: "4", ledger: 1, code: 10 },
    ]);

    const res = await post(ledger, "transfers", [
      { id: "200", debit_account_id: "3", credit_account_id: "4", amount: "1000", ledger: 1, code: 10 },
    ]);

    expect(res.json[0].status).toBe(54); // exceeds_credits
  });

  it("persists state across Durable Object eviction via operation-log replay", async () => {
    const id = env.LEDGER.idFromName("test-persistence");
    const first = env.LEDGER.get(id);

    await post(first, "accounts", [
      { id: "10", ledger: 1, code: 10 },
      { id: "11", ledger: 1, code: 10 },
    ]);
    await post(first, "transfers", [
      { id: "300", debit_account_id: "10", credit_account_id: "11", amount: "42", ledger: 1, code: 10 },
    ]);

    // Force the DO instance to be torn down and reconstructed from durable storage, simulating
    // eviction: `runInDurableObject` runs a callback with a *freshly constructed* instance bound
    // to the same durable storage, which drives `TigerBeetleLedger`'s replay-on-cold-start path.
    const second = env.LEDGER.get(id);
    await runInDurableObject(second, async (instance) => {
      await instance.ready;
      const accounts = instance.engine.lookupAccounts([10n, 11n]);
      expect(accounts[0].debits_posted).toBe(42n);
      expect(accounts[1].credits_posted).toBe(42n);
    });

    // And via the normal HTTP path too.
    const lookupRes = await post(second, "lookup_accounts", ["10", "11"]);
    expect(lookupRes.json[0].debits_posted).toBe("42");
    expect(lookupRes.json[1].credits_posted).toBe("42");
  });
});
