// Wire encoding for `Account`/`Transfer`/`CreateAccountResult`/`CreateTransferResult`, matching
// the `extern struct` layouts in `src/tigerbeetle.zig` byte-for-byte (this is the same wire
// format TigerBeetle's other clients use — nothing wasm-specific about it).
export const ACCOUNT_SIZE = 128;
export const TRANSFER_SIZE = 128;
export const CREATE_ACCOUNT_RESULT_SIZE = 16;
export const CREATE_TRANSFER_RESULT_SIZE = 16;

function writeU128(view, offset, value) {
  const big = BigInt(value);
  view.setBigUint64(offset, big & 0xffffffffffffffffn, true);
  view.setBigUint64(offset + 8, big >> 64n, true);
}

function readU128(view, offset) {
  const lo = view.getBigUint64(offset, true);
  const hi = view.getBigUint64(offset + 8, true);
  return (hi << 64n) | lo;
}

export function encodeAccount(view, offset, account) {
  writeU128(view, offset + 0, account.id);
  writeU128(view, offset + 16, account.debits_pending ?? 0n);
  writeU128(view, offset + 32, account.debits_posted ?? 0n);
  writeU128(view, offset + 48, account.credits_pending ?? 0n);
  writeU128(view, offset + 64, account.credits_posted ?? 0n);
  writeU128(view, offset + 80, account.user_data_128 ?? 0n);
  view.setBigUint64(offset + 96, BigInt(account.user_data_64 ?? 0), true);
  view.setUint32(offset + 104, account.user_data_32 ?? 0, true);
  view.setUint32(offset + 108, 0, true); // reserved
  view.setUint32(offset + 112, account.ledger, true);
  view.setUint16(offset + 116, account.code, true);
  view.setUint16(offset + 118, account.flags ?? 0, true);
  view.setBigUint64(offset + 120, BigInt(account.timestamp ?? 0), true);
}

export function decodeAccount(view, offset) {
  return {
    id: readU128(view, offset + 0),
    debits_pending: readU128(view, offset + 16),
    debits_posted: readU128(view, offset + 32),
    credits_pending: readU128(view, offset + 48),
    credits_posted: readU128(view, offset + 64),
    user_data_128: readU128(view, offset + 80),
    user_data_64: view.getBigUint64(offset + 96, true),
    user_data_32: view.getUint32(offset + 104, true),
    ledger: view.getUint32(offset + 112, true),
    code: view.getUint16(offset + 116, true),
    flags: view.getUint16(offset + 118, true),
    timestamp: view.getBigUint64(offset + 120, true),
  };
}

export function encodeTransfer(view, offset, transfer) {
  writeU128(view, offset + 0, transfer.id);
  writeU128(view, offset + 16, transfer.debit_account_id);
  writeU128(view, offset + 32, transfer.credit_account_id);
  writeU128(view, offset + 48, transfer.amount);
  writeU128(view, offset + 64, transfer.pending_id ?? 0n);
  writeU128(view, offset + 80, transfer.user_data_128 ?? 0n);
  view.setBigUint64(offset + 96, BigInt(transfer.user_data_64 ?? 0), true);
  view.setUint32(offset + 104, transfer.user_data_32 ?? 0, true);
  view.setUint32(offset + 108, transfer.timeout ?? 0, true);
  view.setUint32(offset + 112, transfer.ledger, true);
  view.setUint16(offset + 116, transfer.code, true);
  view.setUint16(offset + 118, transfer.flags ?? 0, true);
  view.setBigUint64(offset + 120, BigInt(transfer.timestamp ?? 0), true);
}

export function decodeTransfer(view, offset) {
  return {
    id: readU128(view, offset + 0),
    debit_account_id: readU128(view, offset + 16),
    credit_account_id: readU128(view, offset + 32),
    amount: readU128(view, offset + 48),
    pending_id: readU128(view, offset + 64),
    user_data_128: readU128(view, offset + 80),
    user_data_64: view.getBigUint64(offset + 96, true),
    user_data_32: view.getUint32(offset + 104, true),
    timeout: view.getUint32(offset + 108, true),
    ledger: view.getUint32(offset + 112, true),
    code: view.getUint16(offset + 116, true),
    flags: view.getUint16(offset + 118, true),
    timestamp: view.getBigUint64(offset + 120, true),
  };
}

export function decodeCreateResult(view, offset) {
  return {
    timestamp: view.getBigUint64(offset + 0, true),
    status: view.getUint32(offset + 8, true),
  };
}

export function encodeU128Array(view, offset, ids) {
  ids.forEach((id, i) => writeU128(view, offset + i * 16, id));
}

export { writeU128, readU128 };
