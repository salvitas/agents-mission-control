# singapore-transport Implementation Plan

## Phase 1 — MCP Foundation
- Scaffold `mcp-lta-datamall`
- Implement DataMall client + auth header + retries
- Add health/check tool and basic schema contracts

## Phase 2 — Read Tools
- Implement `bus_arrival`
- Implement `bus_route`
- Add normalization and response models

## Phase 3 — Geo + Planning
- Implement `nearest_stop` with free-text resolution
- Implement `leave_time` logic (buffered recommendation)

## Phase 4 — Monitoring
- Implement monitor persistence + scheduler
- Implement threshold crossing and dedup
- Add Telegram + WhatsApp notifier adapters

## Phase 5 — Hardening
- Add error taxonomy and fallback messaging
- Add logs/metrics + smoke tests
- Validate quiet-hours behavior

## Phase 6 — Skill Integration (private-first)
- Scaffold `skills/singapore-transport`
- Wire skill workflows to MCP tools
- Add SKILL.md triggers, references, examples
- Prepare private publish package

