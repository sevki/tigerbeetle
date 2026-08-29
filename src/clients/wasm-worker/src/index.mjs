import wasmModule from "../../../../zig-out/wasm/tb_wasm.wasm";
import { TigerBeetleWasm } from "./tb_wasm.mjs";

/// One `TigerBeetleLedger` Durable Object == one single-node, in-memory TigerBeetle ledger
/// (`tb_wasm.wasm`, kept alive across requests for the DO's lifetime — see `TigerBeetleWasm`).
///
/// Durability: `tb_wasm.zig` drives the state machine directly (`prepare`/`commit`), bypassing
/// VSR's real superblock/checkpoint cycle — so its in-memory "disk" bytes are not a meaningful
/// snapshot of ledger state (the LSM's live indices live in the allocator arena, not on that
/// simulated disk). Instead, every committed operation is appended to a durable, ordered log in
/// `ctx.storage` (`log:<sequence>` -> `{operation, events}`); on cold start the DO replays that
/// log through a fresh engine before serving requests. This is sound specifically because the
/// engine is deterministic end to end (fixed simulated clock, no real entropy in the result
/// path) — replaying the same operations in the same order reproduces byte-identical state,
/// the same property TigerBeetle's own deterministic simulator (the VOPR) relies on.
export class TigerBeetleLedger {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ready = ctx.blockConcurrencyWhile(() => this.#restore());
  }

  async #restore() {
    this.engine = await TigerBeetleWasm.instantiate(wasmModule);

    const entries = await this.ctx.storage.list({ prefix: "log:" });
    this.nextSeq = 0;
    for (const [key, entry] of entries) {
      this.nextSeq = Math.max(this.nextSeq, parseSeq(key) + 1);
      replayOne(this.engine, entry);
    }
  }

  async #appendLog(operation, events) {
    const seq = this.nextSeq++;
    await this.ctx.storage.put(logKey(seq), { operation, events });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    try {
      if (request.method === "POST" && url.pathname === "/accounts") {
        const accounts = await request.json();
        const encoded = accounts.map(normalizeAccount);
        const results = this.engine.createAccounts(encoded);
        await this.#appendLog(this.engine.opCreateAccounts, encoded);
        return json(results.map(serializeResult));
      }

      if (request.method === "POST" && url.pathname === "/transfers") {
        const transfers = await request.json();
        const encoded = transfers.map(normalizeTransfer);
        const results = this.engine.createTransfers(encoded);
        await this.#appendLog(this.engine.opCreateTransfers, encoded);
        return json(results.map(serializeResult));
      }

      if (request.method === "POST" && url.pathname === "/lookup_accounts") {
        const ids = (await request.json()).map(BigInt);
        const accounts = this.engine.lookupAccounts(ids);
        return json(accounts.map(serializeAccount));
      }

      if (request.method === "POST" && url.pathname === "/lookup_transfers") {
        const ids = (await request.json()).map(BigInt);
        const transfers = this.engine.lookupTransfers(ids);
        return json(transfers.map(serializeTransfer));
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      return json({ error: String(err?.message ?? err) }, 400);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/ledger\/([^/]+)(\/.*)?$/);
    if (!match) return new Response("expected /ledger/<id>/...", { status: 404 });

    const [, ledgerId, rest] = match;
    const id = env.LEDGER.idFromName(ledgerId);
    const stub = env.LEDGER.get(id);
    const forwardUrl = new URL(rest || "/", url);
    return stub.fetch(new Request(forwardUrl, request));
  },
};

function replayOne(engine, entry) {
  if (entry.operation === engine.opCreateAccounts) {
    engine.createAccounts(entry.events);
  } else if (entry.operation === engine.opCreateTransfers) {
    engine.createTransfers(entry.events);
  } else {
    throw new Error(`unknown logged operation ${entry.operation}`);
  }
}

function logKey(seq) {
  return `log:${String(seq).padStart(16, "0")}`;
}

function parseSeq(key) {
  return Number(key.slice("log:".length));
}

function normalizeAccount(a) {
  return { ...a, id: BigInt(a.id), ledger: Number(a.ledger), code: Number(a.code) };
}

function normalizeTransfer(t) {
  return {
    ...t,
    id: BigInt(t.id),
    debit_account_id: BigInt(t.debit_account_id),
    credit_account_id: BigInt(t.credit_account_id),
    amount: BigInt(t.amount),
    ledger: Number(t.ledger),
    code: Number(t.code),
  };
}

function serializeResult(r) {
  return { timestamp: r.timestamp.toString(), status: r.status };
}

function serializeAccount(a) {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
}

function serializeTransfer(t) {
  return serializeAccount(t);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
