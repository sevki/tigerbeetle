import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv from "ajv";
import createClient from "openapi-fetch";
import { startCelld } from "./celld_harness.mjs";
import { loadOpenApiDocument, responseArraySchema } from "./openapi_schema.mjs";

// Exercises the same HTTP API as ledger.celld.test.mjs, but through a client generated from
// openapi.yaml (openapi-typescript + openapi-fetch — see package.json's `generate:client`
// script for `src/openapi.d.ts`) instead of hand-rolled `fetch()` calls, and additionally
// validates every raw JSON response against the OpenAPI schema with ajv. That second part is
// the real point: a typed client only checks compile-time shape against whatever the spec
// says; this test catches the spec and the server actually disagreeing at runtime.

/** @typedef {import("../src/openapi.d.ts").paths} paths */

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watchDir = path.join(packageDir, ".celld-openapi-test-state");
const port = 19970 + (Number(process.env.VITEST_POOL_ID ?? 0) % 100);

const ajv = new Ajv();
const doc = loadOpenApiDocument();
const validateCreateResults = ajv.compile(responseArraySchema(doc, "CreateResult"));
const validateAccounts = ajv.compile(responseArraySchema(doc, "Account"));
const validateTransfers = ajv.compile(responseArraySchema(doc, "Transfer"));

let celld;
/** @type {import("openapi-fetch").Client<paths>} */
let client;

beforeAll(async () => {
  await rm(watchDir, { recursive: true, force: true });
  celld = startCelld({ port, watchDir });
  await celld.waitUntilReady();
  client = createClient({ baseUrl: celld.url });
}, 60000);

afterAll(async () => {
  await celld?.stop();
  await rm(watchDir, { recursive: true, force: true });
});

function assertValid(validator, data) {
  if (!validator(data)) {
    throw new Error(`response doesn't match openapi.yaml: ${ajv.errorsText(validator.errors)}`);
  }
}

describe("TigerBeetleLedger HTTP API, via a client generated from openapi.yaml", () => {
  it("creates two accounts and moves a transfer between them symmetrically", async () => {
    const { data: created, response: createdRes } = await client.POST(
      "/ledger/{ledgerId}/accounts",
      {
        params: { path: { ledgerId: "openapi-basic" } },
        body: [
          { id: "1", ledger: 1, code: 10 },
          { id: "2", ledger: 1, code: 10 },
        ],
      },
    );
    expect(createdRes.status).toBe(200);
    assertValid(validateCreateResults, created);
    expect(created.map((r) => r.status)).toEqual([0xffffffff, 0xffffffff]);

    const { data: transferred } = await client.POST("/ledger/{ledgerId}/transfers", {
      params: { path: { ledgerId: "openapi-basic" } },
      body: [
        { id: "100", debit_account_id: "1", credit_account_id: "2", amount: "100", ledger: 1, code: 10 },
      ],
    });
    assertValid(validateCreateResults, transferred);
    expect(transferred[0].status).toBe(0xffffffff);

    const { data: accounts, response: lookupRes } = await client.POST(
      "/ledger/{ledgerId}/lookup_accounts",
      {
        params: { path: { ledgerId: "openapi-basic" } },
        body: ["1", "2"],
      },
    );
    expect(lookupRes.status).toBe(200);
    assertValid(validateAccounts, accounts);
    expect(accounts[0].debits_posted).toBe("100");
    expect(accounts[1].credits_posted).toBe("100");
  });

  it("rejects a transfer that would exceed a debits_must_not_exceed_credits account's credits", async () => {
    await client.POST("/ledger/{ledgerId}/accounts", {
      params: { path: { ledgerId: "openapi-reject" } },
      body: [
        { id: "3", ledger: 1, code: 10, flags: 0x0002 }, // debits_must_not_exceed_credits
        { id: "4", ledger: 1, code: 10 },
      ],
    });

    const { data: rejected } = await client.POST("/ledger/{ledgerId}/transfers", {
      params: { path: { ledgerId: "openapi-reject" } },
      body: [
        { id: "200", debit_account_id: "3", credit_account_id: "4", amount: "1000", ledger: 1, code: 10 },
      ],
    });
    assertValid(validateCreateResults, rejected);
    expect(rejected[0].status).toBe(54); // exceeds_credits
  });

  it("looks up transfers and validates them against the Transfer schema", async () => {
    await client.POST("/ledger/{ledgerId}/accounts", {
      params: { path: { ledgerId: "openapi-lookup-transfers" } },
      body: [
        { id: "5", ledger: 1, code: 10 },
        { id: "6", ledger: 1, code: 10 },
      ],
    });
    await client.POST("/ledger/{ledgerId}/transfers", {
      params: { path: { ledgerId: "openapi-lookup-transfers" } },
      body: [
        { id: "400", debit_account_id: "5", credit_account_id: "6", amount: "7", ledger: 1, code: 10 },
      ],
    });

    const { data: transfers, response } = await client.POST("/ledger/{ledgerId}/lookup_transfers", {
      params: { path: { ledgerId: "openapi-lookup-transfers" } },
      body: ["400"],
    });
    expect(response.status).toBe(200);
    assertValid(validateTransfers, transfers);
    expect(transfers[0].amount).toBe("7");
  });
});
