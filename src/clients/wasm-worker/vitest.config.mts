import { defineConfig } from "vitest/config";

// The celld suite (test/ledger.celld.test.mjs) — plain Node/vitest, spawns a real `celld dev`
// process and drives it over HTTP. See vitest.workerd.config.mts for the equivalent Cloudflare
// workerd suite, which needs the `@cloudflare/vitest-pool-workers` pool and is run separately.
export default defineConfig({
  test: {
    include: ["test/*.celld.test.mjs"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
