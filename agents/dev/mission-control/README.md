# OpenClaw Mission Control

Mobile-friendly dashboard to monitor and control OpenClaw agents.

## Features (v0.2)
- Auto-discovers agents and heartbeat states
- Realtime dashboard updates via WebSockets
- Lists cron jobs and supports **Run now / retry now**
- Auto-discovers queue/report/log/transcript artifacts
- Queue adapters (`config/queue-adapters.json`) for agent-specific schemas
- File viewer for markdown/json/log artifacts
- One-click markdown queue approval (`- [ ]` -> `- [x]`)
- Approval + cron action audit trail (`data/approval-audit.jsonl`)
- Multi-agent transcript explorer with text and agent filters

## Run
```bash
cd /Users/salva/.openclaw/workspace/agents/dev/mission-control
npm install
npm run dev
```

Open:
- http://localhost:4872

## Realtime
- WebSocket endpoint: `ws://localhost:4872/ws`

## Security Hardening (OWASP-aligned)
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- Rate limiting (in-memory) to reduce abuse and accidental overload
- Strict input validation (path bounds, UUID validation for cron run IDs, bounded query sizes)
- Safe file access guard (workspace-bound paths, extension allowlist, 1MB file preview limit)
- Optional token auth for mutating endpoints (`/api/approve`, `/api/cron/run`)
  - Set `MISSION_CONTROL_TOKEN=<secret>` and send header `x-mission-token: <secret>`
- Centralized error handling (no stack traces leaked to clients)
- Append-only JSONL audit trail for operator actions

## Files
- `server.js` — API + collector + realtime push
- `public/` — frontend
- `config/queue-adapters.json` — queue parser adapters
- `data/approval-audit.jsonl` — action history log
- `TECH_ARCHITECTURE.md` — architecture + framework/version details
