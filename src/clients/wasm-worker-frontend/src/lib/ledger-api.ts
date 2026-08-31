// Thin client for the TigerBeetle WASM Worker's HTTP API, built on the same
// openapi-fetch + openapi-typescript pairing wasm-worker's own tests use (see
// test/openapi.celld.test.mjs there) — `src/openapi.d.ts` here is generated from
// ../wasm-worker/openapi.yaml (the canonical spec) by `pnpm generate:client`, so the request/
// response shapes below are never hand-duplicated from it.
import createClient from "openapi-fetch";
import type { paths, components } from "@/openapi";

export type AccountInput = components["schemas"]["AccountCreate"];
export type TransferInput = components["schemas"]["TransferCreate"];
export type OperationResult = components["schemas"]["CreateResult"];
export type Account = components["schemas"]["Account"];
export type Transfer = components["schemas"]["Transfer"];

// 0xffffffff — see wasm-worker/API.md's "Errors" section.
export const STATUS_OK = 4294967295;

export class LedgerApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "LedgerApiError";
  }
}

export class LedgerClient {
  private readonly client: ReturnType<typeof createClient<paths>>;

  constructor(
    baseUrl: string,
    private readonly ledgerId: string,
  ) {
    this.client = createClient<paths>({ baseUrl });
  }

  async createAccounts(accounts: AccountInput[]): Promise<OperationResult[]> {
    const { data, error, response } = await this.client.POST(
      "/ledger/{ledgerId}/accounts",
      { params: { path: { ledgerId: this.ledgerId } }, body: accounts },
    );
    if (error) throw new LedgerApiError(error.error, response.status);
    return data;
  }

  async createTransfers(transfers: TransferInput[]): Promise<OperationResult[]> {
    const { data, error, response } = await this.client.POST(
      "/ledger/{ledgerId}/transfers",
      { params: { path: { ledgerId: this.ledgerId } }, body: transfers },
    );
    if (error) throw new LedgerApiError(error.error, response.status);
    return data;
  }

  async lookupAccounts(ids: string[]): Promise<Account[]> {
    const { data, error, response } = await this.client.POST(
      "/ledger/{ledgerId}/lookup_accounts",
      { params: { path: { ledgerId: this.ledgerId } }, body: ids },
    );
    if (error) throw new LedgerApiError(error.error, response.status);
    return data;
  }

  async lookupTransfers(ids: string[]): Promise<Transfer[]> {
    const { data, error, response } = await this.client.POST(
      "/ledger/{ledgerId}/lookup_transfers",
      { params: { path: { ledgerId: this.ledgerId } }, body: ids },
    );
    if (error) throw new LedgerApiError(error.error, response.status);
    return data;
  }
}
