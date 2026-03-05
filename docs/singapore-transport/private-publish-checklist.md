# singapore-transport Private Publish Checklist

## Scope
Private-first publication for:
- `projects/mcp-lta-datamall`
- `skills/singapore-transport`

## Pre-publish checks
- [ ] No secrets committed (`LTA_DATAMALL_API_KEY` env-only)
- [ ] `.env.example` present and clean
- [ ] Smoke test passes with live key in local env
- [ ] Monitor tick runner works and logs structured events
- [ ] Quiet-hours + threshold behavior validated
- [ ] Skill references are up-to-date with implemented tools

## Packaging checks
- [ ] Skill folder contains only required files (`SKILL.md`, references/scripts/assets as needed)
- [ ] No symlinks in publish payload
- [ ] Naming follows lowercase-hyphen convention
- [ ] Description in SKILL.md clearly states trigger conditions

## Release metadata
- [ ] Version tag for private release (`v0.1.0-private` suggested)
- [ ] Changelog entry in project docs
- [ ] Rollback note (previous commit/tag)

## Post-publish validation
- [ ] Skill appears eligible in `openclaw skills check`
- [ ] End-to-end flow works from chat prompt -> tool path -> response
- [ ] Monitor create/list/pause/resume/delete commands verified
