# GO-LIVE APPROVAL PACK — V2_B (BTC 4H)

## Strategy
- Name: V2_B (Regime-switch: trend/range/neutral)
- Market: BTC perpetuals (Hyperliquid)
- Timeframe: 4H
- Session focus: UTC+0 US session volatility window

## Why V2_B
- Better recent return-adjusted profile vs V2_C in latest rolling WF
- Lower drawdown profile and more stable behavior in current regime

## Phase-1 Live Parameters (Week 1)

### Risk
- Risk per trade: **0.75% equity**
- Max trades/day: **6**
- Max concurrent positions: **1**
- Daily loss limit: **-3% equity** (hard stop)
- Weekly kill-switch: **-6% equity** (pause + review)

### Execution rules
- Bracket order required on every entry (SL + TP attached)
- Skip if spread/slippage exceeds threshold
- No-trade window around major macro events: ±2h
- De-prioritize off-session setups unless score is exceptional

### Regime and signal config (V2_B)
- trend_ts_min: 0.18
- trend_sep_min: 0.020
- atr_min: 0.009
- atr_max: 0.036
- vol_mult: 1.05
- range_ts_max: 0.12
- range_bbw_max: 0.065
- range_atr_max: 0.023
- trend_lb: 18
- range_rsi_lo: 36
- range_rsi_hi: 64

### Exit logic (ATR-based)
- trend_sl_atr: 1.6
- trend_tp_atr: 3.4
- trend_max_hold: 18 bars
- range_sl_atr: 1.1
- range_tp_atr: 2.0
- range_max_hold: 9 bars

## Reporting
- Daily summary post: **07:00 SGT** in Telegram
- Include: trades, win rate, net PnL, PF, max DD, rule triggers, adjustments

## Approval command
Reply with exactly:

**APPROVE V2_B GO LIVE**

After approval, bot enters Phase-1 live mode immediately.
