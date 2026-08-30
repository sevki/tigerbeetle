import { makeWasiImports } from "./wasi_shim.mjs";
import {
  ACCOUNT_SIZE,
  TRANSFER_SIZE,
  CREATE_ACCOUNT_RESULT_SIZE,
  CREATE_TRANSFER_RESULT_SIZE,
  encodeAccount,
  decodeAccount,
  encodeTransfer,
  decodeTransfer,
  decodeCreateResult,
  encodeU128Array,
} from "./wire.mjs";

const SUBMIT_STATUS = {
  0: "ok",
  "-1": "invalid_handle",
  "-2": "invalid_operation",
  "-3": "input_invalid",
  "-4": "batch_too_large",
};

/// Thin wrapper around one `tb_wasm_init` handle in one instantiated `tb_wasm.wasm` module.
/// One `TigerBeetleWasm` == one single-node, in-memory TigerBeetle ledger, synchronous end to
/// end (see `src/wasm/tb_wasm.zig`): every method here resolves immediately once the underlying
/// `export fn` returns, there is no pending/async state.
export class TigerBeetleWasm {
  #exports;
  #handle;

  static async instantiate(wasmModuleOrBytes, { clusterId = 0n, replicaId = 0 } = {}) {
    const wasi = makeWasiImports();
    // Workers' `CompiledWasm` module rule hands us an already-compiled `WebAssembly.Module`
    // (`instantiate` then returns the `Instance` directly); the smoke test instead passes raw
    // bytes (`instantiate` then returns `{module, instance}`) — support both.
    const result = await WebAssembly.instantiate(wasmModuleOrBytes, wasi);
    const instance = result instanceof WebAssembly.Instance ? result : result.instance;
    wasi.setMemory(instance.exports.memory);
    instance.exports._initialize();

    const wrapper = new TigerBeetleWasm(instance.exports);
    wrapper.#init(clusterId, replicaId);
    return wrapper;
  }

  constructor(exports) {
    this.#exports = exports;
  }

  get opCreateAccounts() {
    return this.#exports.tb_wasm_op_create_accounts();
  }

  get opCreateTransfers() {
    return this.#exports.tb_wasm_op_create_transfers();
  }

  #init(clusterId, replicaId) {
    const handle = this.#exports.tb_wasm_init(clusterId, replicaId);
    if (handle < 0) {
      throw new Error(`tb_wasm_init failed with status ${handle}`);
    }
    this.#handle = handle;
  }

  #memoryView() {
    return new DataView(this.#exports.memory.buffer);
  }

  // Fails clearly (`RangeError`) instead of writing past `tb_wasm_input_ptr`'s buffer into
  // whatever else lives next to it in linear memory — `tb_wasm_submit`'s own `batch_too_large`
  // check happens Zig-side, too late: by then the encode loop below has already written the
  // full batch through a `DataView` spanning *all* of linear memory, not just that buffer.
  #checkInputCapacity(byteLength) {
    const capacity = this.#exports.tb_wasm_input_capacity(this.#handle);
    if (byteLength > capacity) {
      throw new RangeError(
        `batch too large: ${byteLength} bytes exceeds tb_wasm_input_capacity (${capacity})`,
      );
    }
  }

  #submitEncoded(operation, encodeCount, elementSize, encodeOne) {
    this.#checkInputCapacity(encodeCount * elementSize);
    const inputPtr = this.#exports.tb_wasm_input_ptr(this.#handle);
    const view = this.#memoryView();
    for (let i = 0; i < encodeCount; i++) encodeOne(view, inputPtr + i * elementSize, i);

    const status = this.#exports.tb_wasm_submit(
      this.#handle,
      operation,
      encodeCount * elementSize,
    );
    if (status !== 0) {
      throw new Error(
        `tb_wasm_submit(${operation}) failed: ${SUBMIT_STATUS[status] ?? status}`,
      );
    }

    const outPtr = this.#exports.tb_wasm_output_ptr(this.#handle);
    const outLen = this.#exports.tb_wasm_output_len(this.#handle);
    return { view: this.#memoryView(), outPtr, outLen };
  }

  createAccounts(accounts) {
    const op = this.#exports.tb_wasm_op_create_accounts();
    const { view, outPtr, outLen } = this.#submitEncoded(
      op,
      accounts.length,
      ACCOUNT_SIZE,
      (v, off, i) => encodeAccount(v, off, accounts[i]),
    );
    return decodeResults(view, outPtr, outLen, CREATE_ACCOUNT_RESULT_SIZE);
  }

  createTransfers(transfers) {
    const op = this.#exports.tb_wasm_op_create_transfers();
    const { view, outPtr, outLen } = this.#submitEncoded(
      op,
      transfers.length,
      TRANSFER_SIZE,
      (v, off, i) => encodeTransfer(v, off, transfers[i]),
    );
    return decodeResults(view, outPtr, outLen, CREATE_TRANSFER_RESULT_SIZE);
  }

  lookupAccounts(ids) {
    this.#checkInputCapacity(ids.length * 16);
    const op = this.#exports.tb_wasm_op_lookup_accounts();
    const inputPtr = this.#exports.tb_wasm_input_ptr(this.#handle);
    encodeU128Array(this.#memoryView(), inputPtr, ids);

    const status = this.#exports.tb_wasm_submit(this.#handle, op, ids.length * 16);
    if (status !== 0) {
      throw new Error(`tb_wasm_submit(lookup_accounts) failed: ${SUBMIT_STATUS[status] ?? status}`);
    }
    const outPtr = this.#exports.tb_wasm_output_ptr(this.#handle);
    const outLen = this.#exports.tb_wasm_output_len(this.#handle);
    const view = this.#memoryView();
    const results = [];
    for (let off = 0; off < outLen; off += ACCOUNT_SIZE) {
      results.push(decodeAccount(view, outPtr + off));
    }
    return results;
  }

  lookupTransfers(ids) {
    this.#checkInputCapacity(ids.length * 16);
    const op = this.#exports.tb_wasm_op_lookup_transfers();
    const inputPtr = this.#exports.tb_wasm_input_ptr(this.#handle);
    encodeU128Array(this.#memoryView(), inputPtr, ids);

    const status = this.#exports.tb_wasm_submit(this.#handle, op, ids.length * 16);
    if (status !== 0) {
      throw new Error(`tb_wasm_submit(lookup_transfers) failed: ${SUBMIT_STATUS[status] ?? status}`);
    }
    const outPtr = this.#exports.tb_wasm_output_ptr(this.#handle);
    const outLen = this.#exports.tb_wasm_output_len(this.#handle);
    const view = this.#memoryView();
    const results = [];
    for (let off = 0; off < outLen; off += TRANSFER_SIZE) {
      results.push(decodeTransfer(view, outPtr + off));
    }
    return results;
  }

  deinit() {
    this.#exports.tb_wasm_deinit(this.#handle);
  }
}

function decodeResults(view, outPtr, outLen, resultSize) {
  const results = [];
  for (let off = 0; off < outLen; off += resultSize) {
    results.push(decodeCreateResult(view, outPtr + off));
  }
  return results;
}
