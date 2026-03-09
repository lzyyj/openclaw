#!/usr/bin/env bash

/**
 * 由于不兼容于 Windows (PowerShell/CMD), 目前已被新的脚本 bundle-a2ui.mjs 替代，仅备用
 * Author: lzyyj
 */

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve node executable. Compatible with: Git Bash, WSL, Cygwin, and plain Linux/macOS.
# When run from Windows pnpm via "bash", the shell may be any of the above; node is often not in PATH.
NODE_CMD=""
read_path_file() {
  [[ -f "$ROOT_DIR/.openclaw-node-path" ]] || return 1
  node_dir="$(cat "$ROOT_DIR/.openclaw-node-path" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -n "$node_dir" ]]
}
is_wsl() {
  [[ -n "${WSL_DISTRO_NAME:-}" ]] || [[ -f /proc/version && "$(cat /proc/version 2>/dev/null)" = *[Mm]icrosoft* ]]
}
is_cygwin() {
  [[ -n "${OSTYPE:-}" && "$OSTYPE" = *cygwin* ]] || [[ "$(uname -s 2>/dev/null)" = *CYGWIN* ]]
}
# Convert path file content (Git Bash style /c/ or /D/) to current environment
to_native_path() {
  local p="$1"
  local dr
  if is_wsl; then
    # /c/ -> /mnt/c/, /D/ -> /mnt/d/
    while [[ "$p" =~ ^/([A-Za-z])/ ]]; do
      dr="$(echo "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
      p="/mnt/${dr}${p:2}"
    done
    echo "$p"
  elif is_cygwin; then
    while [[ "$p" =~ ^/([A-Za-z])/ ]]; do
      dr="$(echo "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
      p="/cygdrive/${dr}${p:2}"
    done
    echo "$p"
  else
    echo "$p"
  fi
}
try_node_at() {
  local dir="$1"
  local exe
  for exe in "${dir}/node.exe" "${dir}/node"; do
    if [[ -n "$exe" && -x "$exe" ]]; then
      NODE_CMD="$exe"
      export PATH="${dir}:$PATH"
      return 0
    fi
  done
  return 1
}

if read_path_file; then
  node_dir_native="$(to_native_path "$node_dir")"
  try_node_at "$node_dir_native" || true
fi
if [[ -z "$NODE_CMD" ]] && command -v node >/dev/null 2>&1; then
  NODE_CMD="node"
fi
if [[ -z "$NODE_CMD" ]]; then
  if is_wsl; then
    # WSL: try common Windows node locations; extract Windows user from path file if present
    win_user=""
    if read_path_file; then
      if [[ "$node_dir" =~ /[Uu]sers/([^/]+)/ ]]; then
        win_user="${BASH_REMATCH[1]}"
      fi
    fi
    for base in "/mnt/c/Program Files/nodejs" "/mnt/c/Program Files (x86)/nodejs"; do
      try_node_at "$base" && break
    done
    if [[ -z "$NODE_CMD" && -n "$win_user" ]]; then
      for base in "/mnt/c/Users/${win_user}/AppData/Roaming/npm" "/mnt/c/Users/${win_user}/AppData/Local/Programs/node"; do
        try_node_at "$base" && break
      done
    fi
    if [[ -z "$NODE_CMD" && -n "$USER" ]]; then
      for base in "/mnt/c/Users/$USER/AppData/Roaming/npm" "/mnt/c/Users/$USER/AppData/Local/Programs/node"; do
        try_node_at "$base" && break
      done
    fi
  elif is_cygwin; then
    for base in "/cygdrive/c/Program Files/nodejs" "/cygdrive/c/Program Files (x86)/nodejs"; do
      if try_node_at "$base"; then break; fi
    done
    if [[ -z "$NODE_CMD" && -n "${ProgramFiles:-}" ]]; then
      pf="$(cygpath -u "${ProgramFiles}" 2>/dev/null)" && try_node_at "${pf}/nodejs" || true
    fi
  else
    # Git Bash or similar (MSYS)
    for base in "/c/Program Files/nodejs" "/c/Program Files (x86)/nodejs"; do
      if try_node_at "$base"; then break; fi
    done
  fi
fi
if [[ -z "$NODE_CMD" && -n "${ProgramFiles:-}" ]]; then
  pf_unix="$(cygpath -u "${ProgramFiles}" 2>/dev/null)" && try_node_at "${pf_unix}/nodejs" || true
fi
if [[ -z "$NODE_CMD" && -n "${PROGRAMFILES:-}" ]]; then
  pf_unix="$(cygpath -u "${PROGRAMFILES}" 2>/dev/null)" && try_node_at "${pf_unix}/nodejs" || true
fi
if [[ -z "$NODE_CMD" && -n "${USERPROFILE:-}" ]]; then
  up="$(cygpath -u "${USERPROFILE}" 2>/dev/null)"
  for base in "${up}/miniconda3/Library/bin" "${up}/anaconda3/Library/bin" "${up}/AppData/Local/Programs/node" "${up}/AppData/Roaming/nvm/current"; do
    [[ -n "$base" ]] && try_node_at "$base" && break
  done
fi
if [[ -z "$NODE_CMD" ]]; then
  echo "node: command not found (tried .openclaw-node-path, PATH, WSL/Git Bash/Cygwin locations)" >&2
  echo "On Windows: run this installer from PowerShell so it can write the node path for bash." >&2
  exit 1
fi

on_error() {
  echo "A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle" >&2
  echo "If this persists, verify pnpm deps and try again." >&2
}
trap on_error ERR

HASH_FILE="$ROOT_DIR/src/canvas-host/a2ui/.bundle.hash"
OUTPUT_FILE="$ROOT_DIR/src/canvas-host/a2ui/a2ui.bundle.js"
A2UI_RENDERER_DIR="$ROOT_DIR/vendor/a2ui/renderers/lit"
A2UI_APP_DIR="$ROOT_DIR/apps/shared/OpenClawKit/Tools/CanvasA2UI"

# Docker builds exclude vendor/apps via .dockerignore.
# In that environment we can keep a prebuilt bundle only if it exists.
if [[ ! -d "$A2UI_RENDERER_DIR" || ! -d "$A2UI_APP_DIR" ]]; then
  if [[ -f "$OUTPUT_FILE" ]]; then
    echo "A2UI sources missing; keeping prebuilt bundle."
    exit 0
  fi
  echo "A2UI sources missing and no prebuilt bundle found at: $OUTPUT_FILE" >&2
  exit 1
fi

INPUT_PATHS=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/pnpm-lock.yaml"
  "$A2UI_RENDERER_DIR"
  "$A2UI_APP_DIR"
)

# When running Windows node.exe, it expects Windows paths; Unix-style paths get mis-resolved (e.g. D:\mnt\d\...)
to_win_path() {
  local p="$1"
  if command -v cygpath &>/dev/null; then
    cygpath -w "$p" 2>/dev/null || echo "$p"
  elif is_wsl; then
    if [[ "$p" =~ ^/mnt/([a-zA-Z])/(.*) ]]; then
      dr="$(echo "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')"
      rest="${BASH_REMATCH[2]//\//\\}"
      echo "${dr}:\\${rest}"
    else
      echo "$p"
    fi
  else
    echo "$p"
  fi
}

NODE_ROOT="$ROOT_DIR"
NODE_INPUTS=("${INPUT_PATHS[@]}")
if [[ "$NODE_CMD" = *".exe" ]]; then
  NODE_ROOT="$(to_win_path "$ROOT_DIR")"
  NODE_INPUTS=()
  for p in "${INPUT_PATHS[@]}"; do
    NODE_INPUTS+=("$(to_win_path "$p")")
  done
fi

compute_hash() {
  ROOT_DIR="$NODE_ROOT" "$NODE_CMD" --input-type=module - "${NODE_INPUTS[@]}" <<'NODE'
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.env.ROOT_DIR ?? process.cwd();
const inputs = process.argv.slice(2);
const files = [];

async function walk(entryPath) {
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry));
    }
    return;
  }
  files.push(entryPath);
}

for (const input of inputs) {
  await walk(input);
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

files.sort((a, b) => normalize(a).localeCompare(normalize(b)));

const hash = createHash("sha256");
for (const filePath of files) {
  const rel = normalize(path.relative(rootDir, filePath));
  hash.update(rel);
  hash.update("\0");
  hash.update(await fs.readFile(filePath));
  hash.update("\0");
}

process.stdout.write(hash.digest("hex"));
NODE
}

current_hash="$(compute_hash)"
if [[ -f "$HASH_FILE" ]]; then
  previous_hash="$(cat "$HASH_FILE")"
  if [[ "$previous_hash" == "$current_hash" && -f "$OUTPUT_FILE" ]]; then
    echo "A2UI bundle up to date; skipping."
    exit 0
  fi
fi

pnpm -s exec tsc -p "$A2UI_RENDERER_DIR/tsconfig.json"
if command -v rolldown >/dev/null 2>&1; then
  rolldown -c "$A2UI_APP_DIR/rolldown.config.mjs"
else
  pnpm -s dlx rolldown -c "$A2UI_APP_DIR/rolldown.config.mjs"
fi

echo "$current_hash" > "$HASH_FILE"
