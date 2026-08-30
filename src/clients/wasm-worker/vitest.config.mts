import { defineConfig } from "vitest/config";

// The default (non-workerd) suite: test/*.celld.test.mjs (plain Node/vitest, spawns a real
// `celld dev` process and drives it over HTTP) plus any other plain-Node `*.test.mjs` files that
// don't need a special pool (e.g. engine.test.mjs, which drives tb_wasm.wasm directly). See
// vitest.workerd.config.mts for the Cloudflare workerd suite, which needs the
// `@cloudflare/vitest-pool-workers` pool and is run separately.
export default defineConfig({
  test: {
    include: ["test/*.test.mjs"],
    exclude: ["test/*.workerd.test.mjs"],
    testTimeout: 60000,
    hookTimeout: 60000,
    // `celld dev` always keys its state directory off the project directory itself
    // (`PROJECT/.celld/dev`, per `celld dev --help`) regardless of `CELLD_WATCH` (see
    // celld_harness.mjs) or `--port` — two celld-based test files running in parallel worker
    // processes collide on that one SQLite database ("database is locked"). Serializing test
    // files avoids that; each file's own tests still run in one process.
    fileParallelism: false,
  },
});
