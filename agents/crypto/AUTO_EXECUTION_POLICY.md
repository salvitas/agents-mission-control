# AUTO EXECUTION POLICY (ACTIVE)

Status: ENABLED
Channel: Telegram (current direct chat)

## User-approved limits
- Max risk per trade: 10% of current account equity
- Max trades per day: 4
- Market: Hyperliquid perps

## Operating rules
1. Scan for high-probability setups (trend + momentum + order-flow context).
2. Execute without pre-confirmation when setup passes filters and daily limits.
3. Always attach stop-loss and take-profit at placement (bracket orders preferred).
4. Never exceed 4 new entries per day.
5. If cumulative realized PnL for day <= -20% equity, stop new entries for the day.
6. Post every action and result update to this Telegram chat.

## Notification format
- ENTRY: symbol, side, entry, size, leverage, SL, TP, risk %
- UPDATE: status change (filled/partial/cancelled)
- EXIT: close price, PnL $, PnL %, reason (TP/SL/manual/timeout)

## Safety override
- User can pause anytime with: "pause auto"
- User can resume with: "resume auto"
- User can disable with: "disable auto"
