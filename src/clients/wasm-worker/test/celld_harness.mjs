// Spawns a real `celld dev` process (https://celld.dev — a self-hosted, API-compatible
// reimplementation of Cloudflare's Workers/Durable Objects runtime) against this package and
// waits for it to actually serve requests, so tests exercise the genuine runtime rather than a
// mock of it.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function startCelld({ port, watchDir }) {
  const bin = process.env.CELLD_BIN ?? "celld";
  // `celld dev` bundles with esbuild and needs it findable — explicit here (rather than relying
  // on the caller's PATH containing this package's node_modules/.bin, e.g. via `npm run`)
  // because callers outside this package (the frontend's Playwright e2e tests) invoke this
  // harness without that PATH set up.
  const child = spawn(bin, ["dev", ".", "--port", String(port)], {
    cwd: packageDir,
    env: {
      ...process.env,
      CELLD_WATCH: watchDir,
      CELLD_ESBUILD:
        process.env.CELLD_ESBUILD ?? path.join(packageDir, "node_modules", ".bin", "esbuild"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  // celld's first successful bundle is often followed by one or more "change detected;
  // rebuilding" cycles (its file watcher picking up its own just-written state under
  // `.celld/dev`), each of which briefly resets in-flight connections. Tracking the most recent
  // one lets waitUntilReady require an actual quiet period after the *last* rebuild, rather than
  // guessing a fixed number of blips — a probe-count guess was observed to still land requests
  // mid-restart when celld took more than one extra cycle to settle.
  let lastChangeDetectedAt = 0;
  const onOutput = (d) => {
    output += d;
    if (String(d).includes("change detected")) lastChangeDetectedAt = Date.now();
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);

  const url = `http://127.0.0.1:${port}`;

  async function waitUntilReady(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    let consecutiveOk = 0;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`celld exited early (code ${child.exitCode}):\n${output}`);
      }
      try {
        // Any HTTP response (even a 4xx from an unrecognized route) proves the process is up and
        // the Worker is handling requests.
        await fetch(`${url}/`, { method: "GET" });
        consecutiveOk += 1;
        // Require both several consecutive successes AND a real quiet period since the last
        // observed rebuild, so a rebuild that starts between probes doesn't slip through.
        if (consecutiveOk >= 3 && Date.now() - lastChangeDetectedAt > 750) return;
      } catch {
        consecutiveOk = 0;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`celld did not become ready within ${timeoutMs}ms:\n${output}`);
  }

  async function stop() {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 10000);
    });
  }

  return { url, waitUntilReady, stop, get output() { return output; } };
}
