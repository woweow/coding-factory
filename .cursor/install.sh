#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the statemachines project.
# Prepares the Node toolchain pinned in .nvmrc, the effect-machine submodule,
# and project dependencies. Safe to run repeatedly.
set -euo pipefail

cd "$(dirname "$0")/.."

# Load nvm, which ships on the base image.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Install and default to the Node version pinned in .nvmrc (currently 24).
nvm install
NODE_VERSION="$(cat .nvmrc)"
nvm alias default "$NODE_VERSION" >/dev/null

# The runtime injects an older node earlier in PATH, so expose the pinned node
# from /usr/local/cargo/bin, which precedes it and is writable and persisted.
# This makes `node`, `npm`, and `npx` resolve to the pinned version for every
# shell without mutating shell profiles.
PRIORITY_BIN="/usr/local/cargo/bin"
NODE_BIN_DIR="$(dirname "$(nvm which "$NODE_VERSION")")"
if [ -d "$PRIORITY_BIN" ] && [ -w "$PRIORITY_BIN" ]; then
  for bin in node npm npx; do
    ln -sf "$NODE_BIN_DIR/$bin" "$PRIORITY_BIN/$bin"
  done
fi

# Fetch the effect-machine submodule.
git submodule update --init --recursive

# Install dependencies from the lockfile.
npm ci
