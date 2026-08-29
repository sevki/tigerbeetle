// `tb_wasm.wasm` is built as a WASI "reactor" (see `build.zig`'s `build_wasm`), but only uses
// two WASI imports in practice: `fd_write` (wasi-libc's panic/debug-print path writes to stderr)
// and `random_get` (Zig's CSPRNG seeding). Rather than depend on `node:wasi` — unavailable in
// workerd — this hand-implements exactly those two, so the same shim works in Node (used by the
// smoke test) and inside a Cloudflare Worker.
const ERRNO_SUCCESS = 0;

export function makeWasiImports() {
  let memory;
  return {
    setMemory(m) {
      memory = m;
    },
    wasi_snapshot_preview1: {
      fd_write(fd, iovsPtr, iovsLen, nwrittenPtr) {
        const view = new DataView(memory.buffer);
        const bytes = new Uint8Array(memory.buffer);
        let written = 0;
        const chunks = [];
        for (let i = 0; i < iovsLen; i++) {
          const base = iovsPtr + i * 8;
          const ptr = view.getUint32(base, true);
          const len = view.getUint32(base + 4, true);
          chunks.push(bytes.slice(ptr, ptr + len));
          written += len;
        }
        const text = new TextDecoder().decode(concatBytes(chunks));
        if (fd === 2) console.error(text);
        else console.log(text);
        view.setUint32(nwrittenPtr, written, true);
        return ERRNO_SUCCESS;
      },
      random_get(bufPtr, bufLen) {
        const bytes = new Uint8Array(memory.buffer, bufPtr, bufLen);
        crypto.getRandomValues(bytes);
        return ERRNO_SUCCESS;
      },
    },
  };
}

function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
