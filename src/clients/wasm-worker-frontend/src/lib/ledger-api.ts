// Thin client for the TigerBeetle WASM Worker's HTTP API — see
// src/clients/wasm-worker/API.md in the tigerbeetle repo for the full reference. u128/u64 values
// are transported as decimal strings on the wire (JSON numbers can't hold a full u64/u128), so
// every ID/amount field here is typed and sent as `string`.

export interface AccountInput {
  id: string;
  ledger: number;
  code: number;
  flags?: number;
  user_data_128?: string;
  user_data_64?: string;
  user_data_32?: number;
}

export interface TransferInput {
  id: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: string;
  ledger: number;
  code: number;
  flags?: number;
  user_data_128?: string;
  user_data_64?: string;
  user_data_32?: number;
}

export interface OperationResult {
  timestamp: string;
  status: number;
}

export interface Account extends AccountInput {
  debits_pending: string;
  debits_posted: string;
  credits_pending: string;
  credits_posted: string;
  timestamp: string;
}

export interface Transfer extends TransferInput {
  timestamp: string;
}

// 0xffffffff — see API.md's "Errors" section.
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
  constructor(
    private readonly baseUrl: string,
    private readonly ledgerId: string,
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(
      `${this.baseUrl}/ledger/${encodeURIComponent(this.ledgerId)}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new LedgerApiError(
        payload.error ?? `request failed with HTTP ${res.status}`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  }

  createAccounts(accounts: AccountInput[]): Promise<OperationResult[]> {
    return this.post("/accounts", accounts);
  }

  createTransfers(transfers: TransferInput[]): Promise<OperationResult[]> {
    return this.post("/transfers", transfers);
  }

  lookupAccounts(ids: string[]): Promise<Account[]> {
    return this.post("/lookup_accounts", ids);
  }

  lookupTransfers(ids: string[]): Promise<Transfer[]> {
    return this.post("/lookup_transfers", ids);
  }
}
