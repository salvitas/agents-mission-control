# MEMORY.md

## Salva profile (curated)

- Name: Salva
- Timezone: Asia/Singapore
- Preferred language for assistant interactions: English
- Communication style preference: very direct, short by default

## Working context

- Main current focus in this workspace: OpenClaw + Home Assistant setup and automation
- Recently working on Home Assistant dashboard/media card customization
- Current HA media entities confirmed for HomePods:
  - `media_player.homepod`
  - `media_player.homepod_mini`

## Assistant operating preferences from user

- Default email communication should use AgentMail inbox `salva@agentmail.to`
- For web searches/page browsing, default to `agent-browser`; use fallback browser methods only if agent-browser is unavailable/failing

- Ask before most workspace changes unless explicitly requested
- Ask before external sends/actions unless explicitly approved
- Ask before installs; never destructive without asking
- Always commit when workspace files are changed
- When requested env vars should be added to `~/.zshrc`
- Before changing `openclaw.json`, check latest docs + schema validation first
