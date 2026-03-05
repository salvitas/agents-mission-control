# singapore-transport Architecture

## Decision
Use an MCP-first architecture:
- `mcp-lta-datamall` = reusable integration + business tools
- `singapore-transport` skill = orchestration, UX, alerting workflows

## High-Level Components

1. MCP Server (`mcp-lta-datamall`)
- DataMall API client (auth, retry, normalization)
- Location/nearest-stop resolver
- Leave-time calculator
- Monitor manager and scheduler
- Tool interface for other agents/tools

2. Skill (`singapore-transport`)
- Intent mapping and command patterns
- User-facing summaries and recommendations
- Channel delivery policy (Telegram/WhatsApp)
- Alert cadence and quiet-hours behavior

## Clean Architecture Layers (inside MCP)

- Interface: MCP tool handlers
- Application: use-cases (`get_eta`, `get_route`, `plan_leave_time`, `monitor_tick`)
- Domain: entities + policies
- Infrastructure: DataMall HTTP, geo adapter, persistence, notifier adapters

## Key MCP Tools (v1)
- `bus_arrival(stop_code, service_no?)`
- `bus_route(service_no, direction?)`
- `nearest_stop(destination_text|latlon)`
- `leave_time(origin, destination, service_no?, arrival_target?)`
- `monitor_create(config)`
- `monitor_list()`
- `monitor_pause(id)`
- `monitor_resume(id)`
- `monitor_delete(id)`

## Runtime Defaults
- Forecast horizon: 60 min
- Poll interval: 30 sec
- Thresholds: 15/10/5/leave-now
- Quiet hours: configurable defaults
- Channels: Telegram + WhatsApp

## Security
- API key via env only: `LTA_DATAMALL_API_KEY`
- No secrets in code, commits, or skill references

