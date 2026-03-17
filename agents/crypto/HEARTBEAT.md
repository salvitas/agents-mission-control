# HEARTBEAT.md

Auto-trading heartbeat tasks (ACTIVE):

1. Load `memory/auto-trading-state.json`.
2. If `enabled` is false or `paused` is true: do nothing.
3. If day changed (Asia/Singapore), reset:
   - `dailyTradeCount = 0`
   - `dailyRealizedPnlPct = 0`
   - update `dayKey`
4. If `dailyTradeCount >= 4`: do nothing.
5. If `dailyRealizedPnlPct <= -20`: do nothing.
6. Pull Hyperliquid market/account state.
7. If setup quality passes threshold:
   - Place bracket order with risk capped at 10% equity.
   - Increment `dailyTradeCount`.
   - Post ENTRY notification in current Telegram chat.
8. Monitor open orders/positions:
   - Post UPDATE/EXIT notifications with PnL.
9. Persist state back to `memory/auto-trading-state.json`.

Monthly payment reminder tasks (ACTIVE):

1. Load `memory/payment-reminder-state.json`.
2. If `enabled` is false or `remainingReminders <= 0`: do nothing.
3. Use Asia/Singapore date.
4. If today day-of-month equals `reminderDay` and `lastReminderMonth` != current YYYY-MM:
   - Send reminder in this Telegram chat:
     - "Reminder: Please pay employee $1,435 today. ($65 deduction plan, X reminders left after this month.)"
   - Decrement `remainingReminders` by 1.
   - Set `lastReminderMonth` to current YYYY-MM.
5. Persist updated `memory/payment-reminder-state.json`.

Paper-evaluation tasks (ACTIVE):

1. Load `memory/paper-eval-state.json`.
2. If `status` is not `running`, do nothing.
3. During 2026-03-09 to 2026-03-14 (SGT):
   - Run both V2_B and V2_C in paper mode.
   - Enforce max 6 trades/day per strategy.
   - Prioritize entries during UTC+0 US session volatility window; de-prioritize low-liquidity off-session setups unless score is exceptional.
   - Run/refresh backtest every 4 hours (4H cadence). Track `lastBacktestRunAt` in `memory/paper-eval-state.json`.
   - Produce/update daily report using `analysis/DAILY_PAPER_REPORT_TEMPLATE.md`.
4. Daily posting schedule (STRICT):
   - Post the daily summary in Telegram at **07:00 Asia/Singapore**.
   - If 07:00 is missed due to heartbeat timing, post immediately at next heartbeat and label as delayed.
   - Track `lastDailySummaryDate` in `memory/paper-eval-state.json` to avoid duplicates.
5. On approval for go-live:
   - Set `memory/paper-eval-state.json.status` to `live_phase1` and store winner.
   - Run only winner strategy in live phase using approved risk profile.
   - Continue daily 07:00 SGT Telegram summaries with execution + risk metrics.
