# Nightly Research Sources Registry

> This is the **entry point** for the nightly frontier research run.
> Update this file continuously as new sources are added.

Last updated: 2026-03-16
Owner: salvitas

## How the nightly run should use this file
1. Load this file first.
2. Prioritize sources by tier (Tier 1 > Tier 2 > Tier 3).
3. For each topic, try to include at least:
   - 1 policy/government/standards source (when relevant)
   - 1 academic/technical/independent source
   - 1 operator/industry source
4. If a source is unavailable, note fallback used.

---

## Tier 1 — Personal Curated Inputs (highest priority)

### Feedly
- Status: pending connection
- Feeds/folders: _TBD_
- Access method: API
- Env var mapping:
  - `FEEDLY_API_TOKEN` (required)
  - `FEEDLY_PROFILE_ID` (optional, for user-specific streams)
  - `FEEDLY_PRIORITY_STREAMS` (optional, comma-separated stream IDs)
- Notes: add OPML or folder/feed URLs here; runtime should load token from environment, never from this file.

### Substack
- Status: partially configured
- Newsletters:
  - Capital Flows (@capitalflows)
    - Profile: https://substack.com/@capitalflows
    - RSS: https://www.capitalflowsresearch.com/feed
  - Citrini (@citrini)
    - Profile: https://substack.com/@citrini
    - RSS: https://www.citriniresearch.com/feed
  - InvestAnswers (@investanswers)
    - Profile: https://substack.com/@investanswers
    - RSS: https://investanswers.substack.com/feed
  - Humpdays (@humpdays)
    - Profile: https://substack.com/@humpdays
    - RSS: https://humpdays.substack.com/feed
  - Crypto Hayes (@cryptohayes)
    - Profile: https://substack.com/@cryptohayes
    - RSS: https://cryptohayes.substack.com/feed
  - Gabe Tramble / zaddycoin (@zaddycoin)
    - Profile: https://substack.com/@zaddycoin
    - RSS: _TBD (profile detected; publication feed URL not resolved yet)_
  - Paul Timofeev (@pt1mfv)
    - Profile: https://substack.com/@pt1mfv
    - RSS: _TBD (profile detected; publication feed URL not resolved yet)_
- Access method: RSS preferred, email fallback
- Env var mapping:
  - `SUBSTACK_FEEDS` (optional, comma-separated RSS URLs)
  - `SUBSTACK_EMAIL` (optional; only if email-based retrieval is used)
  - `SUBSTACK_APP_PASSWORD` (optional; only if email-based retrieval is used)
- Notes: prioritize RSS/public feeds. Runtime should load secrets from environment, never from this file.

---

## Tier 2 — Primary / Authoritative Sources

### Policy / Government / Standards
- EUR-Lex (EU regulations / official legal texts)
- NIST (PQC, standards updates)
- BIS / IMF / FSB (finance + macro policy)
- NASA / ESA / arXiv (space + science signals)

### Academic / Technical
- arXiv (AI, robotics, quantum, systems)
- Major lab publication pages (e.g., DeepMind, OpenAI, Anthropic, Microsoft Research)

---

## Tier 3 — Industry / News Discovery (fallback)

### General discovery fallback
- Google News RSS (domain/topic queries)

### Domain trackers / industry sources
- IFR (industrial robotics)
- CoinDesk / Chainalysis / major exchange or protocol blogs (blockchain)
- Vendor engineering blogs and release notes (software + AI)

---

## Current Inputs Active in Pipeline
- [x] Google News RSS fallback
- [ ] Feedly connected
- [x] Substack connected (Capital Flows RSS)

---

## Runtime Secret Loading Policy
- Never store passwords, API keys, cookies, or tokens in this file.
- Load secrets at runtime from environment variables (e.g., from `~/.zshrc`).
- If required env vars are missing, log a warning in the daily index and use configured fallback sources.

### Minimal `.zshrc` example (do not commit)
```bash
# Feedly
export FEEDLY_API_TOKEN="<your_token_here>"
# export FEEDLY_PROFILE_ID="<optional_profile_id>"
# export FEEDLY_PRIORITY_STREAMS="stream/abc,stream/xyz"

# Substack
# Preferred: comma-separated RSS feed URLs
export SUBSTACK_FEEDS="https://example1.substack.com/feed,https://example2.substack.com/feed"

# Optional email-mode credentials (only if needed)
# export SUBSTACK_EMAIL="you@example.com"
# export SUBSTACK_APP_PASSWORD="<app_password>"
```

### Validation checklist
- [ ] `echo $FEEDLY_API_TOKEN` returns non-empty
- [ ] `echo $SUBSTACK_FEEDS` returns one or more RSS URLs
- [ ] New shell session loaded (`source ~/.zshrc`)
- [ ] Nightly run logs source loading status in `index.md`

---

## Change Log
- 2026-03-16: Initial registry created. Set as nightly entry-point source file.
- 2026-03-16: Added env-var mappings for Feedly/Substack and runtime secret-loading policy.
