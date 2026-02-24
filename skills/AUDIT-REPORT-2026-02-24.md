# Skills Security Audit Report (2026-02-24)

## Requested skills
- self improving agent
- financial-market-analysis
- stock-analysis

## Source used
Provided by user:
- https://github.com/openclaw/skills/tree/main/skills/seyhunak/financial-market-analysis

Resolved candidates from same repo:
- `skills/pskoett/self-improving-agent`
- `skills/udiedrichsen/stock-analysis`
- `skills/seyhunak/financial-market-analysis`

## Install status
- Installed (workspace-local):
  - `skills/pskoett/self-improving-agent`
  - `skills/udiedrichsen/stock-analysis`
- Quarantined (NOT active):
  - `skills-quarantine/seyhunak/financial-market-analysis`

## Findings

### 1) financial-market-analysis — **BLOCKED / QUARANTINED**
High risk for your requirement ("no information can leave this computer").

Direct evidence in skill content:
- Requires external Crafted MCP endpoint:
  - `http://bore.pub:44876/api/v1/mcp/project/.../sse`
- Requires paid external API key (`CRAFTED_API_KEY`)
- Explicitly instructs persistence to Firebase
- States analysis is performed on their servers

Conclusion: **Incompatible** with strict local-only data policy.

### 2) stock-analysis — **CONDITIONAL**
Contains scripts that fetch external market/news/social data (Yahoo Finance, CoinGecko, Google News RSS, Reddit) and optional Twitter/X via `bird` CLI subprocess calls.

Conclusion: functional but **network-active by design**. If run normally, data leaves machine.

### 3) self-improving-agent — **LOWER RISK (local-first)**
Main behavior is local markdown logging and hook-driven learning capture.
No mandatory external endpoint in core flow.

Conclusion: acceptable for local-only use, with normal caution.

## Recommendation
For strict no-egress mode:
1. Keep `financial-market-analysis` quarantined (done).
2. Use `self-improving-agent` normally.
3. Use `stock-analysis` only with network disabled at OS/firewall level, or avoid running its fetch scripts.

## Notes
This was a static code/content audit. Runtime guarantees require host-level network policy enforcement.
