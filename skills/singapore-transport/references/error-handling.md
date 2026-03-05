# Error Handling

## Error classes
- `CONFIG_ERROR`: missing/invalid env (`LTA_DATAMALL_API_KEY`)
- `UPSTREAM_HTTP_ERROR`: non-retriable upstream HTTP
- `UPSTREAM_RATE_LIMIT`: 429 from upstream
- `UPSTREAM_NETWORK_ERROR`: connectivity/timeouts
- `NORMALIZATION_ERROR`: malformed response mapping

## Policies
- Retry transient errors with exponential backoff + jitter
- If retry exhausted, return compact human fallback message
- Keep monitor alive unless repeated hard failures exceed policy threshold
- Emit structured logs for each failure path
