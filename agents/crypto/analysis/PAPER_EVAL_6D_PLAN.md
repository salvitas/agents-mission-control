# 6-Day Paper Evaluation Plan (V2_B vs V2_C)

## Objective
Run both strategies in parallel for 6 days, then choose one winner to go live on Day 7 (with your explicit approval).

## Runtime constraints
- Max trades per day (each strategy): 6
- Backtest refresh cadence: every 4 hours (aligned to 4H timeframe)
- Session focus: UTC+0 US session volatility window (prioritize signal execution during US session hours)

## Schedule
- Day 1-6: Paper mode only, both V2_B and V2_C active in parallel.
- End of each day: publish daily report using `DAILY_PAPER_REPORT_TEMPLATE.md`.
- Day 7: choose winner + propose live risk settings.

## Winner Selection Scorecard (weighted)
- 35%: Net return over 6 days
- 25%: Max drawdown (lower is better)
- 20%: Profit factor
- 10%: Execution quality (slippage/fills)
- 10%: Rule adherence / stability

## Hard Elimination Rules
Any strategy is disqualified if:
- Weekly DD > 6%
- Repeated rule violations (risk/trade limits)
- Material execution degradation

## Day-7 Go-Live Proposal Template
- Winner:
- Why:
- Suggested risk per trade:
- Max trades/day:
- Kill-switch thresholds:
- 7-day probation settings:

## Important
No live deployment until backtest + paper results are reviewed and explicitly approved by user.
