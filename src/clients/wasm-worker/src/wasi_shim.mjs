// `tb_wasm.wasm` is built as a WASI "reactor" (see `build.zig`'s `build_wasm`). It never touches
// a real filesystem or stdin, but wasi-libc's CRT startup and stdio machinery still reference a
// handful of filesystem-shaped WASI imports even though this build never exercises the
// filesystem paths behind them. Rather than depend on `node:wasi` — unavailable in workerd —
// this hand-implements all of them, so the same shim works in Node (used by the smoke test) and
// inside a Cloudflare Worker:
//   - `fd_write`: wasi-libc's panic/debug-print path writes to stderr/stdout.
//   - `random_get`: Zig's CSPRNG seeding.
//   - `proc_exit`: wasi-libc's abort()/exit() path, reachable from certain panics.
//   - `fd_fdstat_get`/`fd_close`/`fd_read`: queried for stdin/stdout/stderr (fds 0-2) by generic
//     stdio helpers even when never actually used for real I/O.
//   - `fd_prestat_get`/`fd_prestat_dir_name`/`path_open`: wasi-libc's startup enumerates
//     preopened directories looking for any it recognizes; reporting none (EBADF) for every fd
//     is the correct, standard signal for "no filesystem access", not a missing feature.
const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const FILETYPE_CHARACTER_DEVICE = 2;

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
      proc_exit(code) {
        // A real reactor should never reach this in normal operation; treat it as the fatal
        // condition it is (an unrecoverable panic/assert) rather than silently ignoring it.
        throw new Error(`tb_wasm.wasm called proc_exit(${code}) — this is a fatal engine panic`);
      },
      fd_close(_fd) {
        return ERRNO_SUCCESS;
      },
      fd_read(_fd, _iovsPtr, _iovsLen, nreadPtr) {
        // No stdin: always report 0 bytes read (EOF), never actually read.
        new DataView(memory.buffer).setUint32(nreadPtr, 0, true);
        return ERRNO_SUCCESS;
      },
      fd_fdstat_get(fd, statPtr) {
        if (fd > 2) return ERRNO_BADF;
        // __wasi_fdstat_t: {fs_filetype: u8 @0, fs_flags: u16 @2, fs_rights_base: u64 @8,
        // fs_rights_inheriting: u64 @16} — size 24, align 8.
        const view = new DataView(memory.buffer);
        view.setUint8(statPtr, FILETYPE_CHARACTER_DEVICE);
        view.setUint16(statPtr + 2, 0, true);
        view.setBigUint64(statPtr + 8, 0xffffffffffffffffn, true);
        view.setBigUint64(statPtr + 16, 0xffffffffffffffffn, true);
        return ERRNO_SUCCESS;
      },
      fd_prestat_get(_fd, _prestatPtr) {
        // No preopened directories; this also tells wasi-libc's startup to stop enumerating.
        return ERRNO_BADF;
      },
      fd_prestat_dir_name(_fd, _pathPtr, _pathLen) {
        return ERRNO_BADF;
      },
      path_open(
        _fd,
        _dirflags,
        _pathPtr,
        _pathLen,
        _oflags,
        _rightsBase,
        _rightsInheriting,
        _fdflags,
        _openedFdPtr,
      ) {
        return ERRNO_BADF;
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
