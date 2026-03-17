#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/salva/.openclaw/workspace/agents/crypto"
REPO="$ROOT/skills/local/hyperliquid-mcp-src"
CFG="$ROOT/config/mcporter.json"

HYPERLIQUID_TESTNET="${HYPERLIQUID_TESTNET:-true}"

mcporter config remove hyperliquid --scope project >/dev/null 2>&1 || true
mcporter config add hyperliquid --scope project --transport stdio \
  --command uv \
  --arg --directory \
  --arg "$REPO" \
  --arg run --arg python --arg -m --arg hyperliquid_mcp.server \
  --env HYPERLIQUID_TESTNET="$HYPERLIQUID_TESTNET"

echo "Configured hyperliquid MCP in $CFG"
mcporter --config "$CFG" list hyperliquid --schema || true
