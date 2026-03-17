# Nightly Frontier Research Queue

This folder is auto-updated by the `nightly-frontier-research` cron at 2:00 AM Asia/Singapore.

## Structure
- `YYYY-MM-DD/index.md` — Daily overview and topic index
- `YYYY-MM-DD/*.md` — Per-topic research reports
- `pending-approval.md` — Rolling queue of content pending review for social posting

## Review workflow
For each topic file, review YAML frontmatter fields:
- `approve: true` to approve for social repurposing
- `decline: true` to reject
- `social_ready: true` only when approved and copy is ready
- Set `reviewed_by` and `reviewed_at`

Suggested rule: never set both `approve` and `decline` to true.
