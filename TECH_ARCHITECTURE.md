# OpenClaw Mission Control — Technical Architecture (v0.2)

## Goals
- Unified mission-control dashboard for multi-agent OpenClaw environments
- Mobile-first operator UX
- Auto-discovery of agents, cron jobs, queues, reports, logs, and transcripts
- Safe approval and cron-trigger controls with auditability

## Stack and Versions
- **Runtime:** Node.js `>=22` (tested on `v22.14.0`)
- **Backend framework:** Express `4.19.2`
- **Realtime transport:** ws `8.18.0` (native WebSocket server)
- **Frontend:** Vanilla HTML/CSS/JS (no framework; minimal payload, fast mobile rendering)
- **Data sources:**
  - `openclaw status --json`
  - `openclaw cron list --json`
  - `openclaw cron run <id>`
  - Workspace files (`/Users/salva/.openclaw/workspace/agents/**`)
  - Session transcripts (`/Users/salva/.openclaw/agents/*/sessions/*.jsonl`)

## High-Level Architecture
1. **Collector layer** (server.js)
   - Pulls OpenClaw state from CLI JSON endpoints
   - Scans workspace artifacts and classifies them (`queue`, `cron`, `report`, `log`)
   - Applies queue adapters from `config/queue-adapters.json`
2. **Control layer**
   - Approve queue entries (`/api/approve`)
   - Run/retry cron jobs (`/api/cron/run`)
3. **Audit layer**
   - Appends action events into JSONL: `data/approval-audit.jsonl`
4. **Realtime layer**
   - Pushes full dashboard snapshots over WebSocket (`/ws`) every 10s and on write actions
5. **UI layer**
   - Renders cards for agents, cron jobs, queues, artifacts
   - Transcript explorer with text/agent filters

## API Surface
- `GET /api/dashboard` — full state snapshot
- `GET /api/file?path=...` — safe file preview
- `POST /api/approve` — mark next markdown checkbox as approved
- `POST /api/cron/run` — trigger cron job immediately
- `GET /api/audit?limit=...` — audit history feed
- `GET /api/transcripts?q=&agentId=&limit=` — transcript search
- `WS /ws` — push dashboard snapshot updates

## Queue Adapter Model
`config/queue-adapters.json`
- Match predicates: `agentId`, `ext`, `pathRegex`
- Parser types:
  - `markdownCheckbox`
  - `jsonStatusArray` (configurable `statusField`, pending/approved values)

This allows per-agent queue schema evolution without changing core server code.

## Operational Notes
- Designed for local trusted operation inside your OpenClaw workspace
- Path access is workspace-scoped (path traversal blocked)
- Audit trail is append-only JSONL for easy ingestion into SIEM/log pipelines

## Security Controls (OWASP-focused)
- A05 Security Misconfiguration: hardened response headers + disabled `x-powered-by`
- A01 Broken Access Control: optional token gate for state-changing endpoints
- A03 Injection: no shell interpolation for user values (execFile argv arrays), UUID validation for cron IDs
- A04 Insecure Design: strict path normalization + workspace confinement + extension allowlist
- A08 Software/Data Integrity: append-only audit trail for approvals and cron trigger actions
- A10 SSRF/abuse reduction: simple per-IP rate limiting + body/query bounds
- Error handling: generic 500s to avoid stack disclosure

## Next Hardening Steps (optional)
- Add auth (JWT/session) and role permissions (viewer/approver/operator)
- Add per-action actor identity propagation
- Add optimistic UI + granular WebSocket delta events
- Add adapter schema validation (Ajv) for stricter config safety
