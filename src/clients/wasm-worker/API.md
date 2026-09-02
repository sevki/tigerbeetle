# HTTP API

`src/index.mjs` serves one Durable Object (`TigerBeetleLedger`) per ledger ID, routed through the
default export's `fetch()`:

```
/ledger/<ledgerId>/accounts
/ledger/<ledgerId>/transfers
/ledger/<ledgerId>/lookup_accounts
/ledger/<ledgerId>/lookup_transfers
/ledger/<ledgerId>/codes
```

`<ledgerId>` is an arbitrary string; it's passed to `env.LEDGER.idFromName()`, so the same ID
always resolves to the same Durable Object instance (and therefore the same ledger state).

The full machine-readable shapes live in [`openapi.yaml`](./openapi.yaml) — this file is a human
walkthrough of the same API. Run `npm run generate:client` to turn `openapi.yaml` into a typed
`openapi-fetch` client (`src/openapi.d.ts`, generated/gitignored); `test/openapi.celld.test.mjs`
exercises that client and additionally validates raw responses against `openapi.yaml` at runtime
with [ajv](https://ajv.js.org).

All u128/u64 values (`id`, `amount`, account/transfer IDs, `timestamp`, ...) are transported as
**decimal strings**, not JSON numbers — JSON numbers can't hold a full u64/u128 without losing
precision. This matches `src/tigerbeetle.zig`'s wire types.

## `POST /ledger/<ledgerId>/accounts`

Create one or more accounts. Body: a JSON array of account objects.

```console
curl -X POST localhost:9876/ledger/my-ledger/accounts \
  -d '[{"id":"1","ledger":1,"code":10}]'
```

Request item fields (unset numeric/flag fields default to `0`):

| Field | Type | Notes |
| - | - | - |
| `id` | decimal string (u128) | required, non-zero |
| `ledger` | number | required, non-zero |
| `code` | number | required, non-zero |
| `flags` | number | optional, bitset — see `src/tigerbeetle.zig`'s `AccountFlags` |
| `user_data_128`, `user_data_64`, `user_data_32` | decimal string / number | optional |
| `name` | string | optional, human-readable label — TigerBeetle itself has no such field; stored separately in this DO's own SQLite storage, keyed by account id (see "Names and codes" below) |

Response: a JSON array, one entry per input account, in the same order:

```json
[{ "timestamp": "123456789", "status": 4294967295 }]
```

`status` is `0xffffffff` (4294967295) for success; any other value is a
`CreateAccountResult` code from `src/tigerbeetle.zig` (e.g. account already exists, invalid
flags). `timestamp` is the commit timestamp assigned by the state machine.

## `POST /ledger/<ledgerId>/transfers`

Create one or more transfers. Body: a JSON array of transfer objects.

```console
curl -X POST localhost:9876/ledger/my-ledger/transfers \
  -d '[{"id":"1","debit_account_id":"1","credit_account_id":"2","amount":"100","ledger":1,"code":10}]'
```

Request item fields:

| Field | Type | Notes |
| - | - | - |
| `id` | decimal string (u128) | required, non-zero |
| `debit_account_id`, `credit_account_id` | decimal string (u128) | required, must reference existing accounts |
| `amount` | decimal string (u128) | required |
| `ledger` | number | required, non-zero |
| `code` | number | required, non-zero |
| `flags` | number | optional, bitset — see `TransferFlags` |
| `user_data_128`, `user_data_64`, `user_data_32` | decimal string / number | optional |

Response: same shape as `/accounts` — a `{timestamp, status}` array in input order, where `status`
is a `CreateTransferResult` code (`0xffffffff` = success; otherwise e.g. insufficient balance,
unknown account, exceeds credits/debits).

## `POST /ledger/<ledgerId>/lookup_accounts`

Look up accounts by ID. Body: a JSON array of decimal-string IDs.

```console
curl -X POST localhost:9876/ledger/my-ledger/lookup_accounts -d '["1"]'
```

Response: a JSON array of full account records for the IDs that exist (missing IDs are simply
omitted, not padded with nulls) — same field set as a create request plus `debits_pending`,
`debits_posted`, `credits_pending`, `credits_posted`, and `timestamp`, plus (when set) `name` and
`currency` — see "Names and codes" below.

## `POST /ledger/<ledgerId>/lookup_transfers`

Same as `lookup_accounts`, but for transfer IDs against `/lookup_transfers`, returning full
transfer records (with `currency`, but no `name` — that's an account-level label).

## `GET /ledger/<ledgerId>/codes`

List every `(ledger, code)` pair this ledgerId has registered a meaning for.

```console
curl localhost:9876/ledger/my-ledger/codes
```

Response: a JSON array of `{ledger, code, kind, symbol, name, decimals}` objects, ordered by
`(ledger, code)`.

## `POST /ledger/<ledgerId>/codes`

Register or update what one or more `(ledger, code)` pairs mean. Body: a JSON array of objects;
an entry with a `(ledger, code)` pair that's already registered overwrites it.

```console
curl -X POST localhost:9876/ledger/my-ledger/codes \
  -d '[{"ledger":1,"code":10,"kind":"currency","symbol":"$","name":"US Dollar","decimals":2}]'
```

| Field | Type | Notes |
| - | - | - |
| `ledger` | number | required — TigerBeetle's `ledger` field, not the `<ledgerId>` path segment |
| `code` | number | required — TigerBeetle's `code` field |
| `kind` | string | required, e.g. `"currency"`, `"compute"`, `"storage"` — freeform, not validated |
| `symbol` | string | required, e.g. `"$"`, `"vCPU-hr"` |
| `name` | string | required, e.g. `"US Dollar"` |
| `decimals` | number | optional, default `0` — how many of the smallest unit make one display unit (e.g. `2` for cents) |

Response: the full updated list, same shape as `GET /codes`.

### Names and codes

TigerBeetle's own `ledger`/`code` fields are bare integers with no built-in metadata, and
accounts have no name field at all. `POST /accounts`' optional `name`, and the `/codes` registry
above, fill that gap — both live in this Durable Object's own SQLite storage (not the operation
log the ledger state itself is replayed from), scoped to this `<ledgerId>` alone: two different
ledgers are free to register `code 1` as different things, or name the same account id
differently. `lookup_accounts`/`lookup_transfers` responses include a resolved `name` (accounts
only) and `currency` (both) field whenever a match exists; neither is present when unset.

## Errors

- A malformed request or an engine-level exception (e.g. bad JSON, an oversized batch rejected by
  `tb_wasm_input_capacity()`) returns HTTP 400 with `{"error": "<message>"}`.
- A durable-log write failure *after* the operation already committed against the in-memory engine
  returns HTTP 500 with `{"error": "committed but failed to durably log the operation: ..."}` —
  see the `AppendLogError` handling and the comment above `#appendLog` in `src/index.mjs` for the
  narrow race this still leaves open.
- An unrecognized path returns HTTP 404.

Note that `/accounts` and `/transfers` always return HTTP 200 for a *request* that was itself
well-formed, even when individual items were rejected by the state machine — check each item's
`status` field, not the HTTP status code, for per-item outcomes.
