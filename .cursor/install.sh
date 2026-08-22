#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the statemachines project.
# Prepares the Node toolchain pinned in .nvmrc, Temporal CLI, the
# effect-machine submodule, and project dependencies. Safe to run repeatedly.
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

install_temporal_cli() {
  local dest_dir platform arch tmp archive
  dest_dir="$PRIORITY_BIN"
  if [ ! -d "$dest_dir" ] || [ ! -w "$dest_dir" ]; then
    dest_dir="${HOME}/.local/bin"
    mkdir -p "$dest_dir"
  fi
  if [ -x "${dest_dir}/temporal" ] || command -v temporal >/dev/null 2>&1; then
    return
  fi
  case "$(uname -s)" in
    Linux) platform=linux ;;
    Darwin) platform=darwin ;;
    *)
      echo "unsupported OS for Temporal CLI: $(uname -s)" >&2
      return 1
      ;;
  esac
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *)
      echo "unsupported arch for Temporal CLI: $(uname -m)" >&2
      return 1
      ;;
  esac
  tmp="$(mktemp -d)"
  archive="${tmp}/temporal.tgz"
  curl -fsSL "https://temporal.download/cli/archive/latest?platform=${platform}&arch=${arch}" -o "$archive"
  tar -xzf "$archive" -C "$tmp"
  cp "${tmp}/temporal" "${dest_dir}/temporal"
  chmod 0755 "${dest_dir}/temporal"
  rm -rf "$tmp"
}

install_temporal_cli

# Fetch the effect-machine submodule.
git submodule update --init --recursive

# Install dependencies from the lockfile (includes Temporal TypeScript SDK).
npm ci
