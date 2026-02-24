---
name: ha-mcp-openclaw
description: Use Home Assistant AI's ha-mcp server with mcporter for Home Assistant control and automation.
---

# ha-mcp (Home Assistant AI)

Use this skill to connect OpenClaw/mcporter to `homeassistant-ai/ha-mcp`.

## Prereqs
- `uvx` installed
- `mcporter` installed
- Home Assistant URL and token

## Recommended env
- `HOMEASSISTANT_URL` (example: `http://homeassistant.local:8123`)
- `HOMEASSISTANT_TOKEN` (long-lived access token)

## Configure in mcporter (stdio via uvx)

```bash
mcporter config add ha-mcp \
  --transport stdio \
  --command uvx \
  --arg ha-mcp@latest \
  --env HOMEASSISTANT_URL=${HOMEASSISTANT_URL} \
  --env HOMEASSISTANT_TOKEN=${HOMEASSISTANT_TOKEN}
```

## Basic usage

```bash
mcporter list ha-mcp --schema
mcporter call ha-mcp.ha_get_overview
mcporter call "ha-mcp.ha_search_entities(query: \"kitchen light\")"
mcporter call "ha-mcp.ha_call_service(domain: \"light\", service: \"turn_on\", service_data: {\"entity_id\": \"light.kitchen\"})"
```

## Security note
For local-only privacy, use local HA URL (`http://homeassistant.local:8123` or LAN IP), not any public/demo endpoint.
