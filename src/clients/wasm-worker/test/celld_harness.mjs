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
  const child = spawn(bin, ["dev", ".", "--port", String(port)], {
    cwd: packageDir,
    env: { ...process.env, CELLD_WATCH: watchDir },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const url = `http://127.0.0.1:${port}`;

  async function waitUntilReady(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`celld exited early (code ${child.exitCode}):\n${output}`);
      }
      try {
        // Any HTTP response (even a 4xx from an unrecognized route) proves the process is up
        // and the Worker is handling requests — that's all readiness means here.
        await fetch(`${url}/`, { method: "GET" });
        return;
      } catch {
        // Not listening yet.
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
