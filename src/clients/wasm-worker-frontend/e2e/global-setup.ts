import { rm } from "node:fs/promises";
import path from "node:path";
import { CELLD_PORT } from "../playwright.config";

// Playwright's config/global-setup loader runs as CommonJS, so neither `import.meta.url` nor
// `__dirname` (ESM has neither, and this file is ESM syntax) is available here — Playwright
// always invokes globalSetup with cwd set to the project root (this directory), so build the
// path from that instead.
const watchDir = path.join(process.cwd(), "e2e", ".celld-e2e-state");
// celld's *actual* durable state always lives at `<project>/.celld/dev` regardless of the
// `CELLD_WATCH` env var celld_harness.mjs sets (a celld quirk documented there) -- when this
// suite runs as part of the full CI script, wasm-worker's own `npm test` runs first in the same
// job and leaves data there under other ledger names, which is harmless on its own, but a leaked
// celld dev process (or a previous local run of this suite) writing mid-restart at the moment a
// fresh one starts here can corrupt shared state. Start from a clean slate.
const wasmWorkerCelldDir = path.join(process.cwd(), "..", "wasm-worker", ".celld");

export default async function globalSetup() {
  await rm(watchDir, { recursive: true, force: true });
  await rm(wasmWorkerCelldDir, { recursive: true, force: true });

  // Reuses the wasm-worker package's own celld test harness (a sibling directory — see that
  // package's README for why this frontend isn't nested inside it) rather than duplicating the
  // spawn/readiness-probe logic here. A dynamic import, not a static one: celld_harness.mjs uses
  // `import.meta.url` internally, which breaks under Playwright's CJS-targeting transpilation of
  // *statically* imported modules — dynamic `import()` preserves real ESM semantics regardless.
  const { startCelld } = await import("../../wasm-worker/test/celld_harness.mjs");
  const celld = startCelld({ port: CELLD_PORT, watchDir });
  await celld.waitUntilReady();

  return async () => {
    await celld.stop();
    await rm(watchDir, { recursive: true, force: true });
  };
}
