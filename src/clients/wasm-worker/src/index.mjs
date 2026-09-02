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

    // Metadata TigerBeetle itself doesn't model: an account's human-readable name, and what a
    // given (ledger, code) pair actually *means* (a currency, or a non-monetary unit like
    // compute/storage). Kept in this same Durable Object's real SQLite storage (this class is
    // migrated onto `new_sqlite_classes`, see wrangler.toml) -- not the operation log above,
    // since it isn't state the wasm engine needs replayed, just a lookup table alongside it.
    // Scoped per-ledgerId, same as everything else this DO holds: two different ledgers are free
    // to assign `code 1` to different things.
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS account_names (
        account_id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS codes (
        ledger INTEGER NOT NULL,
        code INTEGER NOT NULL,
        kind TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        decimals INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ledger, code)
      )
    `);
  }

  #nameAccounts(accounts, results) {
    for (let i = 0; i < accounts.length; i++) {
      if (results[i].status === CREATE_SUCCESS && accounts[i].name) {
        this.ctx.storage.sql.exec(
          "INSERT OR REPLACE INTO account_names (account_id, name) VALUES (?, ?)",
          String(accounts[i].id),
          accounts[i].name,
        );
      }
    }
  }

  #accountName(id) {
    const row = this.ctx.storage.sql.exec("SELECT name FROM account_names WHERE account_id = ?", String(id)).toArray()[0];
    return row?.name;
  }

  #code(ledger, code) {
    const row = this.ctx.storage.sql
      .exec("SELECT kind, symbol, name, decimals FROM codes WHERE ledger = ? AND code = ?", ledger, code)
      .toArray()[0];
    return row ? { kind: row.kind, symbol: row.symbol, name: row.name, decimals: row.decimals } : undefined;
  }

  #listCodes() {
    return this.ctx.storage.sql
      .exec("SELECT ledger, code, kind, symbol, name, decimals FROM codes ORDER BY ledger, code")
      .toArray();
  }

  #upsertCodes(entries) {
    for (const c of entries) {
      this.ctx.storage.sql.exec(
        `INSERT INTO codes (ledger, code, kind, symbol, name, decimals) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (ledger, code) DO UPDATE SET
           kind = excluded.kind, symbol = excluded.symbol, name = excluded.name, decimals = excluded.decimals`,
        Number(c.ledger),
        Number(c.code),
        c.kind,
        c.symbol,
        c.name,
        Number(c.decimals ?? 0),
      );
    }
    return this.#listCodes();
  }

  #enrichAccount(a) {
    const out = serializeAccount(a);
    const name = this.#accountName(a.id);
    if (name !== undefined) out.name = name;
    const code = this.#code(a.ledger, a.code);
    if (code !== undefined) out.currency = code;
    return out;
  }

  #enrichTransfer(t) {
    const out = serializeTransfer(t);
    const code = this.#code(t.ledger, t.code);
    if (code !== undefined) out.currency = code;
    return out;
  }

  // Note the narrow race this doesn't close: `engine.createAccounts`/`createTransfers` already
  // mutated the live wasm engine by the time this runs (dense per-item results, decided by
  // `input_valid()` before any mutation — so *this* far in, the batch as a whole always
  // "succeeds" here in the sense of returning results, some possibly rejected). If the
  // `ctx.storage.put()` below then fails (a storage quota/transient failure), that mutation is
  // real but unlogged: the client sees a 500 (below, not silently folded into the generic 400
  // path), but the live instance now holds state that replay-on-restore won't reproduce, until
  // this DO instance is evicted. Actually closing that race needs either a rollback path in the
  // wasm engine (it has none) or a real write-ahead log ahead of the engine mutation instead of
  // after it — both bigger changes than this fix; flagged here rather than silently accepted.
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
        await this.#appendLogOrFail(this.engine.opCreateAccounts, encoded);
        this.#nameAccounts(accounts, results);
        return json(results.map(serializeResult));
      }

      if (request.method === "POST" && url.pathname === "/transfers") {
        const transfers = await request.json();
        const encoded = transfers.map(normalizeTransfer);
        const results = this.engine.createTransfers(encoded);
        await this.#appendLogOrFail(this.engine.opCreateTransfers, encoded);
        return json(results.map(serializeResult));
      }

      if (request.method === "POST" && url.pathname === "/lookup_accounts") {
        const ids = (await request.json()).map(BigInt);
        const accounts = this.engine.lookupAccounts(ids);
        return json(accounts.map((a) => this.#enrichAccount(a)));
      }

      if (request.method === "POST" && url.pathname === "/lookup_transfers") {
        const ids = (await request.json()).map(BigInt);
        const transfers = this.engine.lookupTransfers(ids);
        return json(transfers.map((t) => this.#enrichTransfer(t)));
      }

      // Registry of what a (ledger, code) pair *means* -- a currency, or a non-monetary unit
      // (compute, storage, ...). Scoped to this ledgerId's own SQLite storage, not global: two
      // ledgers are free to assign `code 1` to different things (see #restore).
      if (request.method === "GET" && url.pathname === "/codes") {
        return json(this.#listCodes());
      }

      if (request.method === "POST" && url.pathname === "/codes") {
        const entries = await request.json();
        return json(this.#upsertCodes(entries));
      }

      return new Response("not found", { status: 404 });
    } catch (err) {
      if (err instanceof AppendLogError) {
        return json({ error: err.message }, 500);
      }
      return json({ error: String(err?.message ?? err) }, 400);
    }
  }

  // Distinguishes "the durable log write itself failed" (500 — the request's effect on the live
  // engine is real but wasn't captured durably, see the comment on #appendLog) from an ordinary
  // input-validation failure (400).
  async #appendLogOrFail(operation, events) {
    try {
      await this.#appendLog(operation, events);
    } catch (err) {
      throw new AppendLogError(
        `committed but failed to durably log the operation: ${err?.message ?? err}`,
      );
    }
  }
}

// The DT Bank UI (../wasm-worker-frontend) is served as static assets from this same
// Worker/origin (see wrangler.toml's [assets], `run_worker_first: true` routes every request
// through here first) — same-origin means no CORS headers are needed either.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/ledger\/([^/]+)(\/.*)?$/);
    if (match) {
      const [, ledgerId, rest] = match;
      const id = env.LEDGER.idFromName(ledgerId);
      const stub = env.LEDGER.get(id);
      const forwardUrl = new URL(rest || "/", url);
      return stub.fetch(new Request(forwardUrl, request));
    }

    // Not an API route: serve the built SPA. A real static file (js/css/fonts/favicon/...)
    // always has an extension in its last path segment; a client-side route (/, /accounts,
    // /transfers, ...) never does -- so that split decides exact-asset-match vs. index.html
    // fallback, rather than reacting to a 404 status from `env.ASSETS.fetch()`, whose "not
    // found" behavior (404 vs. a redirect) isn't consistent between celld and wrangler/real
    // Cloudflare (`not_found_handling: "single-page-application"` isn't either, for the same
    // reason).
    if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
      return env.ASSETS.fetch(request);
    }
    // Request "/" itself, not "/index.html" -- the latter is a real filename, and clean-URL
    // asset serving (celld and real Cloudflare both do this) redirects it to "/" rather than
    // serving it directly, which would turn this into a redirect loop for every client route.
    return env.ASSETS.fetch(new Request(new URL("/", url), request));
  },
};

class AppendLogError extends Error {}

// CreateAccountResult/CreateTransferResult's "ok" value (src/tigerbeetle.zig) -- u32 max.
const CREATE_SUCCESS = 0xffffffff;

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
