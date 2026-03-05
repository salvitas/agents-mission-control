---
name: singapore-transport
description: Singapore bus commute assistant over LTA DataMall via MCP. Use for bus ETA at stop, bus route details, leave-home alerts, commute monitoring, and destination free-text nearest-stop resolution with Telegram/WhatsApp notifications.
---

# singapore-transport

Use MCP tools from `mcp-lta-datamall` as the source of truth.

## Default behavior
- Forecast horizon: 60 minutes
- Poll interval: 30 seconds
- Alert thresholds: 15m, 10m, 5m, leave-now
- Quiet hours: configurable defaults
- Notification channels: Telegram + WhatsApp

## Workflows
1. ETA lookup by stop code (optional service filter)
2. Route detail lookup by service number
3. Leave-home recommendation from fixed/GPS origin to destination (free-text nearest-stop resolution)
4. Commute monitor create/list/pause/resume/delete

## References
- `references/command-contract.md`
- `references/alert-policy.md`
- `references/error-handling.md`
