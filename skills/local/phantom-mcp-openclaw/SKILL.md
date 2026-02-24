---
name: phantom-mcp-openclaw
description: Configure and use Phantom Wallet MCP server via mcporter. Use when you need wallet addresses, message signing, transaction signing, token transfers, or token buy quotes through Phantom MCP.
---

# Phantom MCP (OpenClaw + mcporter)

Use this skill to connect OpenClaw to `@phantom/mcp-server` through `mcporter`.

## Safety first
- Use a dedicated low-value Phantom account for AI workflows.
- `transfer_tokens` executes immediately.
- `buy_token` can execute immediately when `execute: true`.

## Required env vars
- `PHANTOM_APP_ID` (required)
- Optional: `PHANTOM_CLIENT_SECRET`, `PHANTOM_CALLBACK_PORT`, `PHANTOM_MCP_DEBUG`

## Configure server in mcporter

```bash
mcporter config remove phantom >/dev/null 2>&1 || true
mcporter config add phantom \
  --transport stdio \
  --command npx \
  --arg -y \
  --arg @phantom/mcp-server \
  --env PHANTOM_APP_ID=${PHANTOM_APP_ID}
```

## Basic usage

```bash
mcporter list phantom --schema
mcporter call phantom.get_wallet_addresses
mcporter call "phantom.sign_message(message: \"hello\", networkId: \"solana:mainnet\")"
```

## Notes
- First auth flow opens browser and creates session at `~/.phantom-mcp/session.json`.
- Keep session file private.
