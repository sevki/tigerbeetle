#!/usr/bin/env bash
set -eEuo pipefail

# Assumes `zig build wasm` has already produced zig-out/wasm/tb_wasm.wasm (build_ci's `wasm`
# CIMode runs that step first — see build.zig).
cd src/clients/wasm-worker

if ! command -v celld >/dev/null 2>&1; then
    curl -fsSL https://celld.dev/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

npm ci
node test/smoke.node.mjs ../../../zig-out/wasm/tb_wasm.wasm
npm test

# Catches config/bundling problems the unit tests above can't: a bad wrangler.toml, a broken
# import, a binding mismatch -- without needing Cloudflare credentials or actually deploying.
npx wrangler deploy --dry-run

# --- Frontend (DT Bank UI): browser end-to-end tests against a real celld instance of the
# Worker above -- see wasm-worker-frontend/README.md for why it's a sibling directory, not
# nested inside wasm-worker.
cd ../wasm-worker-frontend
corepack enable
pnpm install --frozen-lockfile
pnpm build
npx playwright install --with-deps chromium
pnpm test:e2e
