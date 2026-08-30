import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// The workerd suite (test/ledger.workerd.test.mjs) — runs inside Cloudflare's own Workers
// runtime via @cloudflare/vitest-pool-workers. See vitest.config.mts for the equivalent celld
// suite (plain Node/vitest, run separately since the two pools can't share one config).
export default defineConfig({
  test: {
    include: ["test/*.workerd.test.mjs"],
  },
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
});
