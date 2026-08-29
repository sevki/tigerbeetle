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
