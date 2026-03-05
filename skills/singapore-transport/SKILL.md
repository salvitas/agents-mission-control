---
name: singapore-transport
description: Singapore bus commute assistant powered by LTA DataMall through MCP. Use when users ask for bus arrival ETA at stops, bus service route details, leave-home timing recommendations, destination-to-nearest-stop resolution from free text or coordinates, and commute monitoring with Telegram/WhatsApp alerts.
---

# singapore-transport

Use `mcp-lta-datamall` tools as source-of-truth.

## Defaults
- Forecast horizon: 60 minutes
- Poll interval: 30 seconds
- Alert thresholds: 15m, 10m, 5m, leave-now
- Quiet hours: configurable defaults
- Channels: Telegram + WhatsApp

## Execution rules
1. Resolve destination to nearest stop before planning leave time.
2. Prefer service-filtered ETA when service number is provided.
3. Return compact output first (action + mins + stop), then details.
4. For monitors, enforce dedup + quiet-hours suppression.
5. On upstream failures, provide actionable fallback message and retry guidance.

## Supported workflows
1. ETA lookup by stop code (optional service filter)
2. Route details by service number (+ optional direction)
3. Leave-home recommendation from fixed/GPS origin to destination
4. Monitor lifecycle: create, list, pause, resume, delete

## References
- `references/command-contract.md`
- `references/alert-policy.md`
- `references/error-handling.md`
