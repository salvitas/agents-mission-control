# Command Contract

## Intents
- ETA: `ETA at stop <stop_code> [service <service_no>]`
- Route: `Route for bus <service_no> [direction <1|2>]`
- Nearest stop: `Nearest stop to <destination_text|lat,lon>`
- Leave-time: `When should I leave from <origin> to <destination> [service <service_no>]`
- Monitor create: `Monitor commute from <origin> to <destination> [service <service_no>]`
- Monitor control: `List monitors`, `Pause monitor <id>`, `Resume monitor <id>`, `Delete monitor <id>`

## Output Contract (compact-first)
1. Primary action line (`Leave now` / `Leave in Xm` / `No ETA now`)
2. Stop + service summary
3. Optional detail block (next/next2/next3 ETAs, route context)

## Tool Mapping
- `bus_arrival`
- `bus_route`
- `nearest_stop`
- `leave_time`
- `monitor_create`
- `monitor_list`
- `monitor_pause`
- `monitor_resume`
- `monitor_delete`
