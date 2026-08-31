// Sanity-checks `tb_wasm.wasm` runs correctly outside workerd too (plain Node, via the same
// `TigerBeetleWasm`/WASI shim the Worker uses) — useful as a fast local check before reaching
// for the full `workerd` test suite in `ledger.test.mjs`. Run with:
//   node test/smoke.node.mjs ../../../zig-out/wasm/tb_wasm.wasm
import { readFile } from "node:fs/promises";
import { TigerBeetleWasm } from "../src/tb_wasm.mjs";

const wasmPath = process.argv[2];
if (!wasmPath) {
  console.error("usage: node test/smoke.node.mjs <path to tb_wasm.wasm>");
  process.exit(1);
}

const bytes = await readFile(wasmPath);
const engine = await TigerBeetleWasm.instantiate(bytes);

function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`FAIL ${msg}: expected ${expected}, got ${actual}`);
  console.log(`ok ${msg}`);
}

const created = engine.createAccounts([
  { id: 1n, ledger: 1, code: 10 },
  { id: 2n, ledger: 1, code: 10 },
]);
assertEq(created.length, 2, "create_accounts result count");
assertEq(created[0].status, 0xffffffff, "account 1 created");
assertEq(created[1].status, 0xffffffff, "account 2 created");

const transferred = engine.createTransfers([
  { id: 100n, debit_account_id: 1n, credit_account_id: 2n, amount: 100n, ledger: 1, code: 10 },
]);
assertEq(transferred[0].status, 0xffffffff, "transfer created");

const [account1, account2] = engine.lookupAccounts([1n, 2n]);
assertEq(account1.debits_posted, 100n, "account 1 debits_posted == 100");
assertEq(account2.credits_posted, 100n, "account 2 credits_posted == 100");

engine.createAccounts([
  { id: 3n, ledger: 1, code: 10, flags: 0x0002 }, // debits_must_not_exceed_credits
  { id: 4n, ledger: 1, code: 10 },
]);
const [rejected] = engine.createTransfers([
  { id: 200n, debit_account_id: 3n, credit_account_id: 4n, amount: 1000n, ledger: 1, code: 10 },
]);
assertEq(rejected.status, 54, "transfer rejected: exceeds_credits (status 54)");

engine.deinit();
console.log("SMOKE TEST OK");
