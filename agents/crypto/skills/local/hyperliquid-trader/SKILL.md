---
name: hyperliquid-trader
description: Use Hyperliquid MCP via mcporter for account checks, market data, and order workflows on Hyperliquid. Use when user asks to inspect Hyperliquid balances/positions/orders, fetch Hyperliquid market data, or prepare/execute Hyperliquid perpetual trades.
---

# Hyperliquid Trader (local)

Use this local skill with the project-scoped mcporter config:

- Config path: `/Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json`
- Server name: `hyperliquid`
- Source repo: `/Users/salva/.openclaw/workspace/agents/crypto/skills/local/hyperliquid-mcp-src`

## Safety

- Default to **testnet** unless user explicitly requests mainnet.
- Before any order action, confirm: symbol, side, size, leverage, entry type, stop, and take-profit.
- For live orders, require explicit user confirmation in the same turn.

## Environment setup

Set these in shell before using trading tools:

```bash
export HYPERLIQUID_PRIVATE_KEY='0x...'
# Optional advanced mode
export HYPERLIQUID_ACCOUNT_ADDRESS='0x...'
export HYPERLIQUID_VAULT_ADDRESS='0x...'
# true=testnet, false=mainnet
export HYPERLIQUID_TESTNET='true'
```

Then inject into project mcporter config (repeat as needed):

```bash
mcporter config remove hyperliquid --scope project >/dev/null 2>&1 || true
mcporter config add hyperliquid --scope project --transport stdio \
  --command uv \
  --arg --directory \
  --arg /Users/salva/.openclaw/workspace/agents/crypto/skills/local/hyperliquid-mcp-src \
  --arg run --arg python --arg -m --arg hyperliquid_mcp.server \
  --env HYPERLIQUID_PRIVATE_KEY=${HYPERLIQUID_PRIVATE_KEY} \
  --env HYPERLIQUID_TESTNET=${HYPERLIQUID_TESTNET}
```

## Verify connectivity

```bash
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json list hyperliquid --schema
```

## Core calls

```bash
# Account
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json call hyperliquid.hyperliquid_get_balance
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json call hyperliquid.hyperliquid_get_positions

# Market data
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json call hyperliquid.hyperliquid_get_all_mids
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json call hyperliquid.hyperliquid_get_meta

# Orders (example: place limit order)
mcporter --config /Users/salva/.openclaw/workspace/agents/crypto/config/mcporter.json call \
  hyperliquid.hyperliquid_place_order \
  asset:SOL is_buy:true sz:0.05 limit_px:100 tif:Gtc reduce_only:false
```

## Notes

- If wallet is not registered, Hyperliquid returns "User or API Wallet does not exist".
- Ensure wallet is funded/registered on Hyperliquid UI first.
- Keep private key out of committed files.
