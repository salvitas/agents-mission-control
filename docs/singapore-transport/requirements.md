# singapore-transport Requirements (MCP-first)

## Functional Requirements

FR-01 Query bus ETA by stop code.
FR-02 Filter ETA by service number.
FR-03 Retrieve route details by bus service.
FR-04 Resolve free-text destination to nearest stop.
FR-05 Support fixed locations (home/work/custom).
FR-06 Support live GPS location input.
FR-07 Compute leave-home recommendation.
FR-08 Create commute monitors.
FR-09 Send alerts to Telegram and WhatsApp.
FR-10 Support monitor lifecycle (list/pause/resume/delete).
FR-11 Persist monitor state across restart.
FR-12 Explain recommendation rationale.

## Non-Functional Requirements

NFR-01 Env-only secrets (`LTA_DATAMALL_API_KEY`).
NFR-02 Retry/backoff/jitter for transient failures.
NFR-03 Deduplicated alerts to avoid spam.
NFR-04 Structured logs and traceable monitor ticks.
NFR-05 Publishable package structure (private-first).
NFR-06 Clear naming and modular boundaries.

## Alert Policy Defaults

- Thresholds: 15m, 10m, 5m, leave-now
- Forecast horizon: 60m
- Poll interval: 30s
- Quiet hours: enabled, configurable window

