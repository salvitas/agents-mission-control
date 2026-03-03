# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

## Skill Extraction Fields

When a learning is promoted to a skill, add these fields:

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

Example:
```markdown
## [LRN-20250115-001] best_practice

**Logged**: 2025-01-15T10:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build fails on Apple Silicon due to platform mismatch
...
```

---


## [LRN-20260303-001] best_practice

**Logged**: 2026-03-03T22:36:00+08:00
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
For `wacli`, sending via raw phone (`+65...`) can fail with user-info/LID lookup timeout; sending via known chat JID works reliably.

### Details
Observed repeated error during WhatsApp send:
`failed to get user info for +6589490107@s.whatsapp.net to fill LID cache: failed to send usync query: info query timed out`

Also hit lock contention when `wacli sync --follow` was running (`store is locked`).

Successful path:
1. Resolve contact JID from local store (`wacli chats list --query "89490107" --json`)
2. Send using JID directly: `wacli send text --to "6589490107@s.whatsapp.net" --message "..."`

### Suggested Action
When `wacli` send by phone number fails with LID/usync timeout, switch to direct JID send from local chat index.

### Metadata
- Source: error
- Related Files: .learnings/LEARNINGS.md
- Tags: wacli, whatsapp, timeout, jid, reliability
- Pattern-Key: wacli.send.use-jid-on-usync-timeout
- Recurrence-Count: 1
- First-Seen: 2026-03-03
- Last-Seen: 2026-03-03

### Resolution
- **Resolved**: 2026-03-03T22:36:00+08:00
- **Notes**: Message delivery succeeded after switching from `+65...` target to exact `@s.whatsapp.net` JID.

---
